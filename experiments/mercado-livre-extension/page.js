// MV3 isolated world. Only reads and interacts with the visible official generator UI.
// No cookies, localStorage, auth tokens, hidden endpoints, clipboard, or network calls.
(() => {
  if (globalThis.__dropouMlRunning) return;
  globalThis.__dropouMlRunning = true;

  const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
  const visible = el => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  let currentJobId = null;
  const send = message => new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => resolve(response || null));
  });
  const report = (success, message, resultUrl) => send({type:'finished',success,message,resultUrl,jobId:currentJobId});
  const progress = message => send({type:'progress',message,jobId:currentJobId});
  const allowedToContinue = async () => {
    const task = await send({type:'getTask'});
    return Boolean(task?.ok && task.jobId === currentJobId);
  };

  function getCandidates() {
    const values = [];
    const nodes = document.querySelectorAll('a[href],input:not([type=password]),textarea,code,pre,[role="textbox"],[data-testid*="link"]');
    for (const node of Array.from(nodes).slice(0,1200)) {
      if (!visible(node)) continue;
      const pieces = [];
      if (node.tagName === 'A') pieces.push(node.href || '');
      if ('value' in node && typeof node.value === 'string') pieces.push(node.value);
      if (node.matches('code,pre,[data-testid*="link"]')) pieces.push((node.textContent || '').slice(0,2500));
      for (const piece of pieces) values.push(piece);
    }
    // Some result views render the address as text rather than a clickable anchor.
    values.push((document.body?.innerText || '').slice(-30000));
    const found = new Set();
    for (const piece of values) {
      const urls = String(piece).match(/https:\/\/(?:[\w.-]*mercadolivre\.com\.br|meli\.la)\/[^\s"'<>]+/gi) || [];
      for (const raw of urls) {
        const clean = raw.replace(/[),;.\]\}]+$/g,'');
        try {
          const parsed = new URL(clean);
          if (!['https:'].includes(parsed.protocol)) continue;
          const host = parsed.hostname;
          if (!(host === 'meli.la' || host === 'mercadolivre.com.br' || host.endsWith('.mercadolivre.com.br'))) continue;
          const isGenerated = host === 'meli.la' || parsed.searchParams.has('matt_tool') ||
            parsed.searchParams.has('matt_source') || parsed.searchParams.has('matt_word') ||
            parsed.pathname.startsWith('/sec/');
          if (isGenerated) found.add(parsed.href);
        } catch {}
      }
    }
    return found;
  }

  function findField() {
    const fields = Array.from(document.querySelectorAll('textarea,input[type="url"],input[type="text"]')).filter(visible);
    const scored = fields.map(field => {
      if (field.disabled || field.readOnly) return {field,score:-100};
      const placeholder = field.getAttribute('placeholder') || '';
      const parent = field.parentElement?.parentElement?.textContent?.slice(0,800) || '';
      let score = field.tagName === 'TEXTAREA' ? 6 : 0;
      if (/https?:\/\/|URL|link/i.test(placeholder)) score += 7;
      if (/insira.*URL|p[aá]ginas de produto/i.test(parent)) score += 12;
      if (/buscar produtos|pesquisar/i.test(placeholder)) score -= 20;
      return {field,score};
    }).sort((a,b)=>b.score-a.score);
    const top=scored[0];
    if(!top || top.score < 7 || (scored[1] && top.score === scored[1].score)) return null;
    return top.field;
  }

  function setField(field, value) {
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
    if (!setter) throw new Error('O formulário não permite preenchimento.');
    field.focus();
    setter.call(field,value);
    field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
    field.blur();
  }

  function findGenerateButton() {
    const buttons = Array.from(document.querySelectorAll('button,[role="button"],input[type="submit"]')).filter(visible);
    const matches=buttons.filter(el => {
      const label = (el.innerText || el.getAttribute('aria-label') || el.value || '').replace(/\s+/g,' ').trim();
      return /^(gerar|gerar links?|gerar link de afiliado|gerar meus links?)$/i.test(label);
    });
    return matches.length === 1 ? matches[0] : null;
  }

  async function run() {
    const task = await send({type:'getTask'});
    if (!task?.ok || !task.productUrl || !task.jobId) return;
    currentJobId = task.jobId;
    await progress('Aguardando o formulário do Mercado Livre...');
    let field = null;
    for(let i=0;i<60;i++) {
      field=findField();
      if(field) break;
      await sleep(400);
    }
    if (!field) {
      await report(false,'Não encontrei o campo de URLs. Confira se você está logado e na página Gerador de produtos recomendados.');
      return;
    }
    const baseline=getCandidates();
    if (!await allowedToContinue()) return;
    setField(field,task.productUrl);
    await progress('URL preenchida. Aguardando o botão Gerar ficar disponível...');
    let button=null;
    for (let i=0;i<40;i++) {
      button=findGenerateButton();
      if(button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') break;
      await sleep(300);
    }
    if(!button || button.disabled || button.getAttribute('aria-disabled') === 'true') {
      await report(false,'O botão Gerar não ficou disponível. Confira o campo do produto e a etiqueta selecionada na aba de teste.');
      return;
    }
    if (!await allowedToContinue()) return;
    button.click();
    await progress('Geração solicitada. Procurando o link no resultado visível...');
    for(let i=0;i<100;i++) {
      if (!await allowedToContinue()) return;
      const urls=Array.from(getCandidates()).filter(value=>!baseline.has(value) && value !== task.productUrl);
      if (urls.length===1) {
        await report(true,'Link localizado na página.',urls[0]);
        return;
      }
      if(urls.length>1) {
        await report(false,'O Mercado Livre apresentou mais de um link possível. Abra a aba e confira manualmente qual pertence ao produto.');
        return;
      }
      await sleep(350);
    }
    await report(false,'O botão Gerar foi acionado, mas não foi possível ler um novo link. Abra a aba de teste e confira a mensagem do Mercado Livre.');
  }

  run().catch(error => {
    report(false,'Não foi possível completar o teste: '+String(error.message||error).slice(0,170));
  });
})();
