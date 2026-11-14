export function mountAssistant({getContext,getHeroes}){
 const panel=document.createElement('section');panel.className='assistant-panel';panel.id='aiAssistant';
 panel.innerHTML=`<details open><summary><span>✦ AI-ассистент</span><small id="aiStatus">Проверяем Ollama…</small></summary><p class="muted">Обсудите текущий драфт. Решение остаётся за вами.</p><div class="ai-context" id="aiContext"></div><div class="ai-quick"><button type="button" data-question="Кого бы ты посоветовал сейчас и почему? Объясни коротко, без цифр.">Кого выбрать?</button><button type="button" data-question="Сравни трёх лучших доступных героев для выбранной роли. Назови различия и риск.">Сравни героев</button><button type="button" data-question="Чего сейчас не хватает нашей команде? Объясни простыми словами.">Риски состава</button></div><details class="ai-pool"><summary>Мой пул героев <span id="aiPoolCount"></span></summary><p class="muted">Ограничивает ваши пики. Пустой список — все герои. Пул лобби настраивается отдельно.</p><input id="aiPoolSearch" placeholder="Найти героя в моём пуле" aria-label="Поиск в личном пуле"><button id="aiPoolClear" type="button">Сбросить пул</button><div id="aiPoolList"></div></details><div id="aiMessages" class="ai-messages" aria-live="polite"></div><form id="aiForm"><label for="aiQuestion">Вопрос о текущем драфте</label><textarea id="aiQuestion" rows="2" maxlength="2000" placeholder="Например: я не играю на этом герое — кого ещё взять?" required></textarea><div class="ai-actions"><button id="aiSend" class="confirm">Спросить</button><button type="button" id="aiClear">Новый разговор</button><button type="button" id="aiExport">Сохранить разговор</button></div></form><p class="ai-disclaimer">Советы опираются на сохранённые данные. Проверяй актуальность игровых механик.</p></details>`;
 document.getElementById('teams').after(panel);
 const $=id=>document.getElementById(id);let personalPool=[],messages=[],busy=false,lastContext='';
 try{const p=JSON.parse(localStorage.getItem('draftlab-personal-pool')||'[]');if(Array.isArray(p))personalPool=p.filter(id=>getHeroes().some(h=>h.id===id))}catch{}
 const context=()=>({...getContext(),personalPool:[...personalPool]});const key=()=>JSON.stringify(context());
 function pool(){const query=$('aiPoolSearch').value.toLowerCase();$('aiPoolList').replaceChildren();for(const h of getHeroes().filter(h=>h.localized_name.toLowerCase().includes(query))){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=personalPool.includes(h.id);input.onchange=()=>{personalPool=input.checked?[...personalPool,h.id]:personalPool.filter(id=>id!==h.id);persist();};label.append(input,document.createTextNode(h.localized_name));$('aiPoolList').append(label)}$('aiPoolCount').textContent=personalPool.length?`(${personalPool.length})`:'(все)'}
 function persist(){try{localStorage.setItem('draftlab-personal-pool',JSON.stringify(personalPool))}catch{}pool();refresh()}
 function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el}
 function render(){
  const area=$('aiMessages');area.replaceChildren();
  if(!messages.length)area.append(text('p','Привет! Давай обсудим драфт. Можешь спросить, кого выбрать, предложить своего героя или попросить объяснить совет проще.','muted'));
  for(const m of messages){
   const article=document.createElement('article');article.className='ai-message '+m.role;
   article.append(text('strong',m.role==='user'?'Вы':'Draft Lab'));
   if(m.key!==key()&&m.role==='assistant')article.append(text('small','Ответ относится к предыдущему состоянию драфта.','ai-stale'));
   article.append(text('p',m.content));
   if(m.result){
    const r=m.result,details=document.createElement('details');
    details.append(text('summary','На чём основан ответ'));
    const links=document.createElement('div');
    for(const s of r.sources||[]){const el=s.url?document.createElement('a'):document.createElement('span');el.textContent=s.title;if(s.url){el.href=s.url;el.target='_blank';el.rel='noopener noreferrer'}links.append(el,document.createTextNode(' · '))}
    details.append(links);
    if(r.details?.candidates?.length){const list=document.createElement('ul');for(const row of r.details.candidates){list.append(text('li',`${row.name} · позиция ${row.role} · индекс ${row.score}. ${row.reasons.join('; ')}`))}details.append(list)}
    details.append(text('p',(r.limitations||[]).join(' ')));
    details.append(text('small',`${r.model} · ${r.elapsed_seconds} с${r.status==='fallback'?' · ответ не прошёл проверку':''}`));
    const debug=document.createElement('details');debug.append(text('summary','Технический журнал'));debug.append(text('pre',JSON.stringify({snapshot:r.snapshot,usage:r.usage,tools:(r.trace||[]).map(t=>({tool:t.tool,arguments:t.arguments,error:t.result.error}))},null,2)));details.append(debug);article.append(details);
   }
   area.append(article);
  }
  area.scrollTop=area.scrollHeight;
 }

 function refresh(){const now=key();if(now===lastContext)return;lastContext=now;const c=context();$('aiContext').textContent=`${c.side==='radiant'?'Radiant':'Dire'} · ${c.type==='pick'?'пик':'бан'} · ${c.role?'позиция '+c.role:'все свободные роли'} · ${c.metaMode==='fresh'?'снимок по патчу':'общая статистика'}`;render()}
 async function status(){try{const r=await fetch('/api/assistant/status');const s=await r.json();$('aiStatus').textContent=s.ready?'Локальный помощник готов':s.message}catch{$('aiStatus').textContent='Сервер недоступен'}}
 $('aiForm').onsubmit=async e=>{e.preventDefault();if(busy)return;const question=$('aiQuestion').value.trim();if(!question)return;busy=true;$('aiSend').disabled=true;$('aiSend').textContent='Думаю…';$('aiClear').disabled=true;const snapshot=context(),k=JSON.stringify(snapshot),history=messages.filter(m=>!m.error).slice(-6).map(m=>({role:m.role,content:(m.key!==k?'[Предыдущее состояние драфта] ':'')+m.content.slice(0,3500)}));messages.push({role:'user',content:question,key:k});$('aiQuestion').value='';render();const start=Date.now();const timer=setInterval(()=>{$('aiSend').textContent=`Думаю… ${Math.floor((Date.now()-start)/1000)} с`},1000);try{const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...snapshot,question,history})});const result=await response.json();if(!response.ok)throw Error(result.error||'Ошибка сервера');messages.push({role:'assistant',content:result.answer,result,key:k})}catch(err){messages.push({role:'assistant',content:err.message,key:k,error:true})}finally{clearInterval(timer);busy=false;$('aiSend').disabled=false;$('aiSend').textContent='Спросить';$('aiClear').disabled=false;render();status()}};
 panel.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{$('aiQuestion').value=b.dataset.question;$('aiQuestion').focus()});$('aiClear').onclick=()=>{messages=[];render()};$('aiPoolSearch').oninput=pool;$('aiPoolClear').onclick=()=>{personalPool=[];persist()};$('aiExport').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),messages},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='draftlab-ai-dialogue.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};pool();refresh();status();setInterval(refresh,500);
}
