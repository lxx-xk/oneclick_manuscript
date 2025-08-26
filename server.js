/* server.js - oneclick v1 */
import express from 'express'; import cors from 'cors'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const __filename=fileURLToPath(import.meta.url); const __dirname=path.dirname(__filename);
const PORT=process.env.PORT||8787;
const OPENAI_API_KEY=process.env.OPENAI_API_KEY||readEnv('.env','OPENAI_API_KEY');
const OPENAI_BASE=process.env.OPENAI_BASE||'https://api.openai.com/v1';
const MODEL=process.env.OPENAI_MODEL||'gpt-4o-mini';
function readEnv(file,key){try{const t=fs.readFileSync(path.join(__dirname,file),'utf8');const m=t.match(new RegExp('^'+key+'\\s*=\\s*(.+)$','m'));return m?m[1].trim():'';}catch(e){return ''}}
if(!OPENAI_API_KEY) console.warn('[WARN] OPENAI_API_KEY 미설정 — 호출 시 실패합니다.');
const app=express(); app.use(cors({origin:true})); app.use(express.json({limit:'2mb'})); app.use(express.static(path.join(__dirname,'public')));
const clean=t=>String(t||'').replace(/\u00A0/g,' ').replace(/[ \t]{2,}/g,' ').replace(/\s+\n/g,'\n').trim(); const noSpaceLen=s=>String(s||'').replace(/\s/g,'').length;
const splitSentences=txt=>String(txt).split(/(?<=[.?!])\s+|(?<=[.?!])$/).filter(Boolean);
const dedupeSentences=txt=>{const seen=new Set();const out=[];for(const p of splitSentences(txt)){const k=p.replace(/\s+/g,' ').trim();if(!seen.has(k)){seen.add(k);out.push(p)}}return out.join(' ')};
const normalizePriceText=txt=>{let t=txt; t=t.replace(/₩?\s?\d[\d,]*\s*원/g,'부담 없는 금액'); t=t.replace(/\d+ ?만원대/g,'부담 없는 금액대'); t=t.replace(/\b\d{4,}\b(?=\s*(원|가격|비용))/g,'합리적인 범위'); return t;};
function enforceLength(txt,target='300-500',mode='review'){let min=0,max=1e9; if(target==='100-300'){min=100;max=300}else if(target==='300-500'){min=300;max=500}else if(target==='600-800'){min=600;max=800}else if(target==='800-1000'){min=800;max=1000}else if(target==='1000-2000'){min=1000;max=2000} let out=clean(txt); out=dedupeSentences(out); out=normalizePriceText(out); const fr=['과하지 않은 디테일이 은근히 매력적이었어요.','동선이 편해서 머무는 시간이 자연스럽게 길어졌어요.','작은 배려가 곳곳에 보여 기분 좋게 머물렀어요.','리듬감 있는 진행 덕분에 전반적으로 편안했어요.']; const fi=['처음 찾는 분들은 운영 안내와 예약 여부를 먼저 확인하면 더 수월합니다.','대중교통과 자차 모두 접근성이 무난해 이용 부담이 적습니다.','혼잡 시간대에는 대기가 생길 수 있어 시간 조절이 도움이 됩니다.','핵심만 파악하면 목적에 맞게 활용하기 좋은 구성입니다.']; let guard=0; while(noSpaceLen(out)<min && guard++<120){const pool=(mode==='info'?fi:fr); const f=pool[Math.floor(Math.random()*pool.length)]; if(!out.includes(f)) out+=' '+f;} if(noSpaceLen(out)>max){let parts=splitSentences(out); while(noSpaceLen(parts.join(' '))>max && parts.length>3){parts.pop()} out=parts.join(' ')} return out;}
function systemPrompt(mode,hideName=false){const review=`너는 구독자 2천만 명을 보유한 유명 한국 블로거의 집필 보조다.
후기성 리뷰 작성 가이드:
- 실제 방문처럼 생생한 묘사(분위기·서비스·디테일).
- 개인 방문 이유로 시작, '~해요/~했어요' 대화체.
- 여러 메뉴가 있어도 1~2개만 집중.
- 가격은 금액 대신 '가성비 좋다/합리적/부담 없다' 표현.
- 과장/메타발언/해시태그/소제목/굵게 금지.
- 마지막에 방문 가치의 이유를 담아 추천.
- 같은 장소라도 관점 바꿔 신선하게.
- 결과는 본문만.`;
const info=`너는 사용자가 준 가이드를 바탕으로 정보성 포스팅을 쓰는 작성 보조다.
정보성 작성 가이드:
- 독자의 고민을 콕 집는 도입(끝까지 읽을 이유).
- 핵심 정보·팁을 자연스럽게, 광고톤/경험담 금지, 하나의 글로 쭉.
- 굵게/소제목/해시태그 금지, 친근하지만 신뢰감 있는 문체.
- 같은 업체라도 관점을 바꿔 중복 회피.
- 결과는 본문만.
${hideName?'- 업체명 언급 금지.\n':''}`; return (mode==='review'?review:info);}
function userPrompt({mode,length,company,guide,personaSeed,hideName}){const lengthLine=`길이(공백 제외 기준): ${length}`; const persona=(mode==='review'?'개인 방문 이유를 1문장으로 시작하세요.':'독자의 고민을 한줄로 선명하게 제시하고 시작하세요.'); const extras=(mode==='review'?"여러 메뉴/서비스가 언급돼도 1~2개만 골라 구체적이되 과장 없이 묘사하세요. 가격은 금액 대신 '가성비 좋다/합리적이다/부담 없다' 같은 표현으로.":"정보는 간결하게 풀되 딱딱하지 않게. 경험담처럼 쓰지 말고, 조언/팁을 필요할 때만 자연스럽게."); return `입력
- 업체명: ${hideName && mode==='info' ? '(언급 금지)' : (company||'(미확인)')}
- 가이드: <${(guide||'').slice(0,2200)}>
- 페르소나 변주: ${personaSeed||'기본'}
- ${lengthLine}

요청
- 모드: ${mode}
- ${persona}
- ${extras}
- 반드시 공백 제외 글자 수가 지정 범위에 들어가게 작성.
- 본문만 출력.`;}
async function askOpenAI(system,input){const res=await fetch(`${OPENAI_BASE}/responses`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify({model:MODEL,input:[{role:'system',content:system},{role:'user',content:input}],temperature:0.7}),signal:AbortSignal.timeout(110000)}); if(!res.ok){const msg=await res.text().catch(()=> ''); throw new Error(`OpenAI API 오류: ${res.status} ${msg}`);} const data=await res.json(); const text=(data?.output?.[0]?.content?.[0]?.text)||(data?.choices?.[0]?.message?.content)||(typeof data==='string'?data:''); if(!text) throw new Error('응답 파싱 실패'); return text;}
app.get('/health',(req,res)=>res.json({ok:true,model:MODEL,ts:Date.now()}));
app.post('/generate', async (req,res)=>{try{const b=req.body||{}; const mode=(String(b.mode||'review').toLowerCase()==='info'?'info':'review'); const length=String(b.length||'300-500'); const company=clean(b.company||''); const guide=clean(b.guide||''); const personaSeed=clean(b.persona_seed||''); const hideName=!!b.hide_name; const allowed=new Set(['100-300','300-500','600-800','800-1000','1000-2000']); const lengthNorm=allowed.has(length)?length:'300-500'; if(!OPENAI_API_KEY) return res.status(500).json({error:'OPENAI_API_KEY not set'}); if(!guide && !company) return res.status(400).json({error:'company 또는 guide 중 하나는 필요합니다.'}); const sys=systemPrompt(mode,hideName); const usr=userPrompt({mode,length:lengthNorm,company,guide,personaSeed,hideName}); const raw=await askOpenAI(sys,usr); const adjusted=enforceLength(raw,lengthNorm,mode); res.json({text:adjusted,meta:{model:MODEL,mode,length:lengthNorm,char_no_space:noSpaceLen(adjusted)}});}catch(err){res.status(500).json({error:err?.message||'server error'});}});
app.listen(PORT,()=>console.log(`[oneclick-app] http://localhost:${PORT}  (model=${MODEL})`));
