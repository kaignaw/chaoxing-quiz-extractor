// ==UserScript==
// @name         超星学习通-随堂练习题目与答案提取器
// @namespace    https://github.com/Kaignaw/chaoxing-quiz-extractor
// @version      1.0
// @description  一键提取超星学习通任务中随堂练习/章节测验的题目和正确答案，支持单选、多选、判断、填空题
// @author       Kaignaw
// @match        *://*.chaoxing.com/*
// @match        *://*.xuexitong.com/*
// @icon         https://www.chaoxing.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  GM_addStyle(`
    #cx-extractor-btn{position:fixed;bottom:30px;right:30px;z-index:99999;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#4A90D9,#357ABD);color:#fff;font-size:13px;font-weight:bold;border:none;box-shadow:0 4px 20px rgba(74,144,217,.5);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .3s ease;font-family:"Microsoft YaHei",sans-serif;line-height:1.2;text-align:center;letter-spacing:1px;}
    #cx-extractor-btn:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(74,144,217,.7);}
    #cx-extractor-btn:active{transform:scale(.95);}
    #cx-extractor-modal{position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;font-family:"Microsoft YaHei","PingFang SC",sans-serif;}
    #cx-extractor-modal.show{display:flex;}
    #cx-extractor-modal .modal-box{background:#fff;border-radius:16px;width:92%;max-width:960px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:cxModalIn .25s ease;}
    @keyframes cxModalIn{from{opacity:0;transform:translateY(30px) scale(.96);}to{opacity:1;transform:translateY(0) scale(1);}}
    #cx-extractor-modal .modal-header{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid #eee;flex-shrink:0;}
    #cx-extractor-modal .modal-header h2{margin:0;font-size:20px;color:#333;display:flex;align-items:center;gap:8px;}
    #cx-extractor-modal .modal-header h2 small{font-size:14px;font-weight:normal;color:#999;}
    #cx-extractor-modal .modal-actions{display:flex;gap:10px;}
    #cx-extractor-modal .modal-actions button{padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;transition:background .2s;}
    #cx-extractor-modal .btn-copy{background:#4A90D9;color:#fff;}
    #cx-extractor-modal .btn-copy:hover{background:#357ABD;}
    #cx-extractor-modal .btn-close{background:#f0f0f0;color:#666;}
    #cx-extractor-modal .btn-close:hover{background:#e0e0e0;}
    #cx-extractor-modal .modal-body{flex:1;overflow-y:auto;padding:20px 24px;}
    #cx-extractor-modal .question-item{background:#f7f9fc;border-radius:12px;padding:16px 20px;margin-bottom:14px;border-left:4px solid #4A90D9;}
    #cx-extractor-modal .question-item .q-title{font-weight:bold;color:#222;margin-bottom:10px;font-size:15px;}
    #cx-extractor-modal .question-item .q-type{display:inline-block;font-size:11px;padding:2px 8px;border-radius:4px;margin-left:8px;font-weight:normal;vertical-align:middle;}
    #cx-extractor-modal .q-type.single{background:#e8f5e9;color:#2e7d32;}
    #cx-extractor-modal .q-type.multi{background:#fff3e0;color:#e65100;}
    #cx-extractor-modal .q-type.judge{background:#e3f2fd;color:#1565c0;}
    #cx-extractor-modal .q-type.fill{background:#f3e5f5;color:#6a1b9a;}
    #cx-extractor-modal .question-item .q-options{margin:6px 0 4px;padding-left:4px;}
    #cx-extractor-modal .question-item .q-option{padding:4px 0;font-size:14px;color:#444;}
    #cx-extractor-modal .question-item .q-option.correct{color:#2e7d32;font-weight:bold;}
    #cx-extractor-modal .question-item .q-option.correct::before{content:"✔ ";color:#2e7d32;}
    #cx-extractor-modal .question-item .q-answer{margin-top:8px;padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:14px;color:#2e7d32;font-weight:bold;}
    #cx-extractor-modal .question-item .q-answer .label{font-weight:normal;color:#666;}
    #cx-extractor-modal .empty-msg{text-align:center;color:#999;padding:60px 20px;font-size:16px;}
    #cx-extractor-toast{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100001;background:rgba(0,0,0,.78);color:#fff;padding:14px 28px;border-radius:10px;font-size:15px;font-family:"Microsoft YaHei",sans-serif;pointer-events:none;opacity:0;transition:opacity .3s;}
    #cx-extractor-toast.show{opacity:1;}
  `);

  let toastTimer=null;
  function showToast(msg){
    let el=document.getElementById('cx-extractor-toast');
    if(!el){el=document.createElement('div');el.id='cx-extractor-toast';document.body.appendChild(el);}
    el.textContent=msg;el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
  }

  const TYPE_RE=/\[(判断|单选|多选|填空)(题)?\]/;
  const TYPE_MAP={判断:'judge',单选:'single',多选:'multi',填空:'fill'};

  function getWorkDocs(){
    const docs=[{doc:document,src:'top'}];
    document.querySelectorAll('iframe,frame').forEach((iframe,i)=>{
      try{const idoc=iframe.contentDocument||iframe.contentWindow?.document;if(idoc&&idoc.body)docs.push({doc:idoc,src:`iframe[${i}]`});}catch(e){}
    });
    return docs;
  }

  function findMasterContainer(doc){
    const candidates=[];const seen=new Set();
    const sels=['.TiMu','.questionLi','.question-panel','.exam-question','.topic-item','.cy_question','.questionBox','.ques_item','.assessment-item','[class*="question"]','[class*="timu"]','[class*="TiMu"]'];
    sels.forEach(sel=>{try{doc.querySelectorAll(sel).forEach(el=>{const t=el.textContent.trim();if(t.length<20||!TYPE_RE.test(t))return;const k=t.slice(0,60);if(!seen.has(k)){seen.add(k);candidates.push(el);}});}catch(e){}});
    if(!candidates.length){doc.querySelectorAll('div').forEach(div=>{const t=div.textContent.trim();if(t.length<30||!TYPE_RE.test(t))return;const k=t.slice(0,60);if(!seen.has(k)){seen.add(k);candidates.push(div);}});}
    if(!candidates.length) return null;
    candidates.sort((a,b)=>((b.textContent.match(TYPE_RE)||[]).length)-((a.textContent.match(TYPE_RE)||[]).length));
    return candidates[0];
  }

  function parseAllQuestions(doc){
    const master=findMasterContainer(doc);
    if(!master) return [];
    const text=master.textContent;
    const segments=text.split(/(?=\[(判断|单选|多选|填空)(题)?\])/);
    const results=[];const seenQ=new Set();
    segments.forEach(seg=>{
      seg=seg.trim();
      if(!seg||seg.length<15||!TYPE_RE.test(seg)) return;
      const item=parseOne(seg);
      if(!item) return;
      const key=item.question.slice(0,40);
      if(seenQ.has(key)) return;
      seenQ.add(key);
      results.push(item);
    });
    return results;
  }

  function parseOne(seg){
    const tm=seg.match(TYPE_RE);
    if(!tm) return null;
    const type=TYPE_MAP[tm[1]]||'single';

    // Extract answer first
    let answer='';
    const am=seg.match(/正确答案[：:]\s*([^\s]+?)(?=\s*我的答案|全对|半对|错误|正确率|$|\d)/);
    if(am) answer=am[1].trim();

    // Locate ALL option letter positions (A. B. C. D. etc.)
    // Each option starts with a letter A-D followed by . 、 or similar
    const optEntries=[];
    const optRe=/([A-D])\s*[.、．]\s*/g;
    let m;
    while((m=optRe.exec(seg))!==null){
      const before=seg.slice(Math.max(0,m.index-10),m.index);
      if(/正确答案/.test(before)) continue; // skip "正确答案：A" etc.
      // Entry stores: letter, index of letter, index after the pattern
      optEntries.push({
        label:m[1],
        letterIdx:m.index,       // position of the letter A
        afterLabel:optRe.lastIndex // position after "A. " (or "A、" etc.)
      });
    }

    // If no options found and not judge, use fallback
    if(!optEntries.length && type!=='judge'){
      // Try searching for letter followed by various separators
      const fallbackRe=/([A-D])\s*[.、．\s\)）]\s*/g;
      while((m=fallbackRe.exec(seg))!==null){
        const before=seg.slice(Math.max(0,m.index-10),m.index);
        if(/正确答案/.test(before)) continue;
        optEntries.push({
          label:m[1],
          letterIdx:m.index,
          afterLabel:fallbackRe.lastIndex
        });
      }
    }

    // ---- Extract question text ----
    let questionText='';
    if(optEntries.length>0){
      // Truncate at the first option letter position
      questionText=seg.slice(0,optEntries[0].letterIdx).trim();
    } else {
      // No options: use everything before "正确答案"
      const pos=seg.search(/正确答案[：:]/);
      questionText=(pos>0?seg.slice(0,pos):seg).trim();
    }
    // Remove [题型] tag
    questionText=questionText.replace(TYPE_RE,'').trim();
    // Remove trailing （题型）
    questionText=questionText.replace(/[（(](判断|单选|多选|填空)(题)?[)）]/g,'');
    // Remove leading number
    questionText=questionText.replace(/^[\s\d]+[.、．\s\)）]*/,'');
    // Remove "本题已答" and everything after
    const jp=questionText.search(/本题已答|已答\s*\(/);
    if(jp>5) questionText=questionText.slice(0,jp).trim();
    // Compress whitespace
    questionText=questionText.replace(/\s{2,}/g,' ').trim();
    if(!questionText) return null;

    // ---- Extract options ----
    let options=[];
    if(type==='judge'){
      const aOk=answer?/正确|对|T|true/i.test(answer):false;
      options.push({label:'A',text:'正确',isCorrect:aOk});
      options.push({label:'B',text:'错误',isCorrect:!aOk});
      return {question:questionText,type,options,answer};
    }

    // Build options from entries
    for(let i=0;i<optEntries.length;i++){
      const {label,afterLabel}=optEntries[i];
      // Text starts after "A. " and ends before the next letter
      const nextLetterIdx=i<optEntries.length-1?optEntries[i+1].letterIdx:seg.length;
      let optText=seg.slice(afterLabel,nextLetterIdx).trim();
      // Remove trailing "正确答案" or "4.[题型]"
      optText=optText.replace(/正确答案[：:].*$/,'').trim();
      // Remove trailing question number like " 4." or " 6." at end
      optText=optText.replace(/\s+\d+\.\s*$/,'').trim();
      // Strip statistics: "64人 87.7%", "对 52人 71.2%", "0/0 100%"
      optText=optText.replace(/\s*\d+\s*人\s*[\d.]+%/g,'');
      optText=optText.replace(/\s*[\d.]+\/[\d.]+\s*[\d.]+%/g,'');
      optText=optText.replace(/^(对|错)\s*\d+\s*人\s*[\d.]+%/,'');
      // Remove "全对 (0) 半对 (0) 错误 (0)" and "正确率: XX% XX人全对"
      optText=optText.replace(/全对\s*\(0\)\s*半对\s*\(0\)\s*错误\s*\(0\)/,'');
      optText=optText.replace(/正确率[\s\S]*?(?=\s+[A-D]|正确答案|$)/,'');
      // Remove trailing junk: "查看...", "提示...", "导出..."
      optText=optText.replace(/\s*查看[\s\S]*$/,'');
      optText=optText.replace(/\s*提示[\s\S]*$/,'');
      optText=optText.replace(/\s*导出[\s\S]*$/,'');
      optText=optText.replace(/\s{2,}/g,' ').trim();

      if(!optText) optText=label;
      const isCorrect=answer?new RegExp('\\b'+label+'\\b').test(answer.replace(/\s/g,'')):false;
      options.push({label,text:optText,isCorrect});
    }

    return {question:questionText,type,options,answer};
  }

  function extractAll(){
    const results=[];const seen=new Set();
    getWorkDocs().forEach(({doc})=>parseAllQuestions(doc).forEach(item=>{
      const key=item.question.slice(0,40);
      if(seen.has(key)) return;seen.add(key);results.push(item);
    }));
    return results;
  }

  function renderModal(questions){
    let existing=document.getElementById('cx-extractor-modal');if(existing)existing.remove();
    const modal=document.createElement('div');modal.id='cx-extractor-modal';
    modal.innerHTML=`<div class="modal-box"><div class="modal-header"><h2>随堂练习答案 <small id="cx-q-count">共 0 题</small></h2><div class="modal-actions"><button class="btn-copy" id="cx-copy-all">复制全部</button><button class="btn-close" id="cx-close-modal">关闭</button></div></div><div class="modal-body" id="cx-modal-body"></div></div>`;
    document.body.appendChild(modal);
    const body=modal.querySelector('#cx-modal-body'),cnt=modal.querySelector('#cx-q-count');
    if(!questions.length){body.innerHTML='<div class="empty-msg">未检测到题目</div>';cnt.textContent='共 0 题';}
    else{
      cnt.textContent=`共 ${questions.length} 题`;
      const tm={single:'单选题',multi:'多选题',judge:'判断题',fill:'填空题'};
      questions.forEach((q,i)=>{
        const tl=tm[q.type]||'未知',tc=q.type==='single'?'single':q.type==='multi'?'multi':q.type==='judge'?'judge':'fill';
        const oh=q.options.map(o=>`<div ${o.isCorrect?'class="q-option correct"':'class="q-option"'}>${o.label?o.label+'. ':''}${escHtml(o.text)}</div>`).join('');
        const ah=q.answer?`<div class="q-answer"><span class="label">正确答案：</span>${escHtml(q.answer)}</div>`:(q.options.some(o=>o.isCorrect)?`<div class="q-answer"><span class="label">正确答案：</span>${q.options.filter(o=>o.isCorrect).map(o=>o.label||o.text).join('、')}</div>`:'');
        body.innerHTML+=`<div class="question-item"><div class="q-title">${i+1}. ${escHtml(q.question)} <span class="q-type ${tc}">${tl}</span></div>${q.type==='fill'?'':`<div class="q-options">${oh}</div>`}${ah}</div>`;
      });
    }
    modal.classList.add('show');
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('show');});
    modal.querySelector('#cx-close-modal').addEventListener('click',()=>modal.classList.remove('show'));
    modal.querySelector('#cx-copy-all').addEventListener('click',()=>copyQuestions(questions));
  }

  function escHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

  function copyQuestions(questions){
    if(!questions.length){showToast('没有题目可复制');return;}
    const tm={single:'单选题',multi:'多选题',judge:'判断题',fill:'填空题'};
    const parts=questions.map((q,i)=>{
      let t=`${i+1}. ${q.question}（${tm[q.type]||'未知'}）\n`;const al=[];
      q.options.forEach(o=>{if(o.text&&o.text!==o.label)t+=`   ${o.label}${o.label?'. ':''}${o.text}\n`;if(o.isCorrect)al.push(o.label||o.text);});
      if(q.answer)t+=`   正确答案：${q.answer}\n`;else if(al.length)t+=`   正确答案：${al.join('、')}\n`;
      return t;
    }).join('\n');
    const full=`随堂练习题目与答案（共 ${questions.length} 题）\n${'='.repeat(40)}\n\n${parts}\n${'='.repeat(40)}\n提取时间：${new Date().toLocaleString()}`;
    try{if(typeof GM_setClipboard!=='undefined'){GM_setClipboard(full);showToast('已复制到剪贴板');return;}}catch(e){}
    if(navigator.clipboard?.writeText){navigator.clipboard.writeText(full).then(()=>showToast('已复制到剪贴板')).catch(()=>fallbackCopy(full));}else fallbackCopy(full);
  }
  function fallbackCopy(text){const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';ta.style.top='-9999px';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');showToast('已复制到剪贴板');}catch(e){showToast('复制失败');}document.body.removeChild(ta);}

  function init(){if(document.getElementById('cx-extractor-btn'))return;const btn=document.createElement('button');btn.id='cx-extractor-btn';btn.textContent='提取\n答案';document.body.appendChild(btn);btn.addEventListener('click',()=>renderModal(extractAll()));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  let lastUrl=location.href;
  new MutationObserver(()=>{if(location.href!==lastUrl){lastUrl=location.href;setTimeout(init,800);}}).observe(document.body,{childList:true,subtree:true});
})();
