'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {parseScreenshot,OcrFields} from '@/lib/ocr';
import {supabase} from '@/lib/supabase';
import {api} from '@/lib/api';
import {Brand} from '@/lib/ai';
import {VisualResult} from '@/lib/visual';
import {canvasBlob,clipboardImages,MAX_IMAGES,optimizedSize,pastedImages,validateImageFiles} from '@/lib/image-input';
type Crop={x:number;y:number;w:number;h:number};
type Shot={id:string;file:File;url:string;crop:Crop};
const fullCrop:Crop={x:0,y:0,w:100,h:100};
async function imageCanvas(shot:Shot){
 const img=new Image();img.src=shot.url;await img.decode();
 const {x,y,w,h}=shot.crop,sx=img.naturalWidth*x/100,sy=img.naturalHeight*y/100;
 const sw=Math.max(1,img.naturalWidth*Math.min(w,100-x)/100),sh=Math.max(1,img.naturalHeight*Math.min(h,100-y)/100);
 const size=optimizedSize(sw,sh),canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
 const context=canvas.getContext('2d');if(!context)throw new Error('Seu navegador não conseguiu preparar a imagem.');
 context.fillStyle='#fff';context.fillRect(0,0,size.width,size.height);context.drawImage(img,sx,sy,sw,sh,0,0,size.width,size.height);return canvas;
}
async function optimizedImage(shot:Shot){
 const canvas=await imageCanvas(shot);let blob=await canvasBlob(canvas);
 for(const quality of [0.8,0.68]){if(blob.size<=750000)break;blob=await canvasBlob(canvas,quality);}
 if(blob.size>750000)throw new Error('Recorte a região do anúncio para manter o print legível e leve.');
 const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Falha ao ler a imagem.'));reader.readAsDataURL(blob);});
 return {dataUrl,width:canvas.width,height:canvas.height};
}
export default function ImageInput({onExtract,onImage,onVisual,onChange,onBusy,affiliateUrl='',brand='dropou',savedPath}:{onExtract?:(fields:OcrFields)=>void;onImage:(path:string|undefined)=>void;onVisual?:(result:VisualResult)=>void;onChange?:()=>void;onBusy?:(busy:boolean)=>void;affiliateUrl?:string;brand?:Brand;savedPath?:string}){
 const [shots,setShots]=useState<Shot[]>([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[consent,setConsent]=useState(false),[removeSaved,setRemoveSaved]=useState(false);
 const [estimate,setEstimate]=useState<{enabled:boolean;model:string;estimates:{images:number;reservedUsd:number}[]}>();
 const fileInput=useRef<HTMLInputElement>(null),replace=useRef<string|null>(null),canvas=useRef<HTMLCanvasElement>(null),urls=useRef(new Set<string>()),lock=useRef(false);
 const current=shots.find(s=>s.id===selected)||shots[0];
 useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current.clear();},[]);
 const hasVisual=!!onVisual;
 useEffect(()=>{if(hasVisual)api<typeof estimate>('/api/ai/visual').then(setEstimate).catch(()=>{});},[hasVisual]);
 const add=useCallback((files:File[],replaceId:string|null=null)=>{
  try{validateImageFiles(files);if(!files.length)return;
   const count=replaceId?shots.length:shots.length+files.length;if(count>MAX_IMAGES)throw new Error('Use até três prints do mesmo produto. Remova ou substitua um print para continuar.');
   const next=files.slice(0,replaceId?1:MAX_IMAGES).map(file=>{const url=URL.createObjectURL(file);urls.current.add(url);return {id:crypto.randomUUID(),file,url,crop:{...fullCrop}};});
   if(replaceId){const old=shots.find(s=>s.id===replaceId);if(old){URL.revokeObjectURL(old.url);urls.current.delete(old.url);}setShots(list=>list.map(s=>s.id===replaceId?next[0]:s));}else setShots(list=>[...list,...next]);
   setSelected(next[0].id);setMessage('Print em memória. Clique em Gerar oferta para analisar.');onChange?.();
  }catch(e){setMessage((e as Error).message);}
 },[shots,onChange]);
 useEffect(()=>{const paste=(event:ClipboardEvent)=>{if(lock.current)return;const files=pastedImages(event.clipboardData);if(files.length){event.preventDefault();add(files);}};window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste);},[add]);
 useEffect(()=>{let cancelled=false;if(current)imageCanvas(current).then(source=>{if(cancelled||!canvas.current)return;canvas.current.width=source.width;canvas.current.height=source.height;canvas.current.getContext('2d')?.drawImage(source,0,0);}).catch(()=>{if(!cancelled)setMessage('Imagem inválida. Selecione outro arquivo.');});return()=>{cancelled=true;};},[current]);
 async function action(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);onBusy?.(true);setMessage('');try{await fn();}catch(e){setMessage((e as Error).message);}finally{lock.current=false;setBusy(false);onBusy?.(false);}}
 async function ocr(images?:Awaited<ReturnType<typeof optimizedImage>>[],prefix=''){
  const prepared=images||await Promise.all(shots.map(optimizedImage));const {createWorker}=await import('tesseract.js');setMessage(prefix+' Lendo gratuitamente neste dispositivo…');
  const worker=await createWorker('por');try{const reads=[];for(const image of prepared)reads.push((await worker.recognize(image.dataUrl)).data);onExtract?.(parseScreenshot(reads.map(r=>r.text).join('\n'),Math.min(...reads.map(r=>r.confidence))));setMessage(prefix+' OCR local concluído. Confira os campos sinalizados.');}finally{await worker.terminate();}
 }
 return <div className="wide settings-card image-input"><div className="print-paste-area" tabIndex={0} role="region" aria-label="Cole o print do produto" onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();if(!busy)add(Array.from(e.dataTransfer.files));}}><h3>Cole o print do produto</h3><p>Use Windows + Shift + S e depois Ctrl + V aqui. No celular, cole a imagem quando disponível ou escolha da galeria.</p><small>Até três prints do mesmo anúncio · PNG, JPEG e WebP · também pode arrastar arquivos</small><div className="copy-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>action(async()=>{add(await clipboardImages(navigator.clipboard,window.isSecureContext));})}>Colar imagem</button><button type="button" className="secondary" disabled={busy} onClick={()=>{replace.current=null;fileInput.current?.click();}}>Selecionar imagens / galeria</button></div><input ref={fileInput} disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e=>{add(Array.from(e.target.files||[]),replace.current);replace.current=null;e.target.value='';}}/></div>
 {!!shots.length&&<><div className="print-thumbnails">{shots.map((shot,i)=><div key={shot.id}><button type="button" aria-label={'Selecionar print '+(i+1)} aria-pressed={current?.id===shot.id} disabled={busy} onClick={()=>setSelected(shot.id)}><img src={shot.url} alt={'Print '+(i+1)} width={90} height={70}/></button><button type="button" className="text-button" disabled={busy} onClick={()=>{replace.current=shot.id;fileInput.current?.click();}}>Substituir</button><button type="button" className="text-button" disabled={busy} onClick={()=>{URL.revokeObjectURL(shot.url);urls.current.delete(shot.url);setShots(list=>list.filter(s=>s.id!==shot.id));onChange?.();}}>Remover</button></div>)}</div><canvas ref={canvas} style={{maxWidth:'100%',maxHeight:360,objectFit:'contain'}}/>
 {current&&<details><summary>Recortar a região do anúncio ou a foto do produto</summary><small>Selecione a região de nome, variante e preços antes da análise. Para guardar uma foto, recorte depois e use a ação separada abaixo.</small>{(['x','y','w','h'] as const).map((key,i)=><label key={key}>{['Esquerda','Topo','Largura','Altura'][i]} (%)<input type="range" disabled={busy} min={key==='w'||key==='h'?1:0} max={key==='w'||key==='h'?100:99} value={current.crop[key]} onChange={e=>setShots(list=>list.map(s=>s.id===current.id?{...s,crop:{...s.crop,[key]:Number(e.target.value)}}:s))}/></label>)}</details>}
 {estimate&&<p className="fine-print">{estimate.enabled?'Leitura visual disponível':'Leitura visual paga desativada; OCR gratuito disponível'}. Reserva máxima estimada para {shots.length} print(s): US$ {estimate.estimates.find(e=>e.images===shots.length)?.reservedUsd.toFixed(6)}. Cache não gera cobrança nova.</p>}
 <div className="copy-actions">{onVisual&&<button type="button" className="primary" disabled={busy||!affiliateUrl} onClick={()=>action(async()=>{const images=await Promise.all(shots.map(optimizedImage));let result:VisualResult;try{result=await api<VisualResult>('/api/ai/visual','POST',{url:affiliateUrl,brand,images});}catch(e){await ocr(images,(e as Error).message);return;}if(result.extraction){onVisual(result);setMessage(result.source==='cache'?'Resultado recuperado do cache, sem nova chamada paga.':'Dados e chamada criativa obtidos na mesma requisição. Confira a prévia antes de salvar.'+(result.usage?` Custo pelos tokens reportados: US$ ${result.usage.cost.toFixed(6)}.`:''));}else await ocr(images,result.message||'Leitura visual indisponível.');})}>Gerar oferta</button>}{onExtract&&<button type="button" className="secondary" disabled={busy} onClick={()=>action(()=>ocr())}>Ler gratuitamente com OCR</button>}</div>
 <details style={{marginTop:16}}><summary>Imagem para publicação (opcional)</summary><p>Sem foto guardada, o Telegram pode usar a prévia automática do link. O print completo não será salvo.</p><label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Autorizo guardar este recorte no Supabase Storage para publicar ou agendar.</label><button type="button" className="secondary" disabled={busy||!consent} onClick={()=>action(async()=>{if(!current)return;const blob=await canvasBlob(await imageCanvas(current),0.88),form=new FormData();form.set('file',blob,'produto.jpg');form.set('consent','true');const session=await supabase?.auth.getSession();if(!session?.data.session)throw new Error('Entre na sua conta.');const response=await fetch('/api/products/image',{method:'POST',headers:{Authorization:'Bearer '+session.data.session.access_token},body:form});const data=await response.json();if(!response.ok)throw new Error(data.error||'Falha no envio da imagem.');onImage(data.path);setConsent(false);setMessage('Recorte guardado por sua autorização. Salve o produto para associá-lo.');})}>Guardar recorte para publicação</button></details></>}
 {savedPath&&<div><small>Há uma imagem guardada para esta oferta.</small><button type="button" className="secondary" disabled={busy} onClick={()=>setRemoveSaved(true)}>Excluir imagem guardada</button>{removeSaved&&<div className="section-note">Excluir o arquivo do Storage? A legenda e o histórico serão preservados.<button type="button" className="secondary" onClick={()=>setRemoveSaved(false)}>Cancelar</button><button type="button" className="secondary" disabled={busy} onClick={()=>action(async()=>{await api('/api/products/image','DELETE',{path:savedPath});onImage(undefined);setRemoveSaved(false);setMessage('Imagem excluída do armazenamento.');})}>Confirmar exclusão</button></div>}</div>}
 <small>Os prints ficam em memória até você removê-los ou fechar este cadastro. Na leitura visual, somente as cópias otimizadas são enviadas ao backend e à OpenAI; não são salvas no servidor ou no Supabase.</small><p role="status">{busy?'Processando… ':''}{message}</p></div>;
}
