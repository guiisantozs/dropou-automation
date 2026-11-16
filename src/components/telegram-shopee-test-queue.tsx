'use client';
import {useState} from 'react';
import type {MtprotoShopeeQueue} from '@/lib/telegram-mtproto-shopee';

export default function TelegramShopeeTestQueue({queue,eventsClassName}:{queue?:MtprotoShopeeQueue;eventsClassName?:string}){
 const [copy,setCopy]=useState<{id:string;message:string}|null>(null);
 const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Bahia'});
 const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 async function copyLink(id:string,url:string){try{await navigator.clipboard.writeText(url);setCopy({id,message:'Link copiado.'});}catch{setCopy({id,message:'Não foi possível copiar. Abra o link para conferir manualmente.'});}}
 if(queue?.persistent)return <section className="settings-card"><h2>Ofertas espelhadas</h2><p>Os links recebidos durante o teste são guardados na fila permanente. Encerrar o diagnóstico não apaga ofertas ou seu histórico.</p><a href="/?brand=dropou&view=mirrored-offers">Abrir ofertas espelhadas</a></section>;
 return <section className="settings-card" aria-label="Fila de teste Shopee">
  <h2>Ofertas Shopee · fila de teste</h2>
  <p>Identificação de links em novos textos e legendas de fotos da fonte controlada. Nenhum produto será cadastrado ou publicado por aparecer aqui.</p>
  <p className="fine-print muted">Links da nossa conta vêm da API oficial Shopee ou do cache recente, sob a cota de importações. A fila é temporária, limitada a 50 itens e uma hora. Encerrar e limpar diagnóstico também limpa esta fila; reiniciar o worker apaga os itens.</p>
  {queue?.error&&<p role="status">{queue.error}</p>}
  {queue?.limitReached&&<p role="status">Limite desta janela atingido. Até cinco links por mensagem, 50 itens e dez links curtos distintos por teste.</p>}
  {queue?.items.length?<ol className={eventsClassName} aria-label="Produtos identificados nas mensagens">
   {queue.items.map(item=><li key={item.id}>
    <strong>Mensagem #{item.messageId} · {item.kind==='photo'?'foto com legenda':'texto'}</strong>
    <span>{item.state==='resolving'?'Resolvendo link…':item.state==='error'?'Produto não identificado':item.conversion?.product?.name||item.catalog?.name||'Produto identificado pelos IDs Shopee'}</span>
    <small>Plataforma: Shopee</small>
    {item.shopId&&item.itemId&&<small>Loja {item.shopId} · produto {item.itemId}</small>}
    {item.catalog?.status==='found'&&<span>{item.catalog.archived?'Já existe no catálogo desta marca · arquivado':'Já existe no catálogo desta marca'}</span>}
    {item.catalog?.status==='missing'&&<span>Não encontrado no catálogo desta marca. Nenhum cadastro será criado neste teste.</span>}
    {item.repeatedInTest&&<small>Este produto também apareceu em outra mensagem deste teste.</small>}
    {item.error&&<p role="status">{item.error}</p>}
    {item.conversion&&<>
     <strong role="status">{{identified:'Identificado',waiting:'Aguardando conversão',converting:'Convertendo',generated:'Link gerado',error:'Falha na conversão'}[item.conversion.state]}</strong>
     {item.conversion.product&&<>
      {/* Product image is the API's URL, never downloaded from Telegram. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.conversion.product.image} alt={item.conversion.product.name} width={88} height={88} loading="lazy" referrerPolicy="no-referrer" style={{objectFit:'contain',maxWidth:'100%'}}/>
      <span>{money(item.conversion.product.price)}{item.conversion.product.priceMax>item.conversion.product.price?` a ${money(item.conversion.product.priceMax)}`:''}</span>
      <small>Dados da API {item.conversion.source==='cache'?'· cache recente ':''}· conferidos {date(item.conversion.product.checkedAt)}</small>
      <small>Preço anterior e variação específica: não informados pela API nesta consulta. O preço da mensagem não é utilizado.</small>
     </>}
     {item.conversion.state==='generated'&&item.conversion.affiliateUrl&&<>
      <a href={item.conversion.affiliateUrl} target="_blank" rel="noreferrer sponsored nofollow">{item.conversion.affiliateUrl}</a>
      <button className="btn secondary" type="button" onClick={()=>void copyLink(item.id,item.conversion!.affiliateUrl!)}>Copiar link afiliado</button>
      {copy?.id===item.id&&<small role="status">{copy.message}</small>}
     </>}
     {item.conversion.error&&<p role="status">{item.conversion.error}</p>}
     {!item.conversion.product&&<small>Nome, imagem, preço e variação da API indisponíveis nesta conversão.</small>}
    </>}
    {item.canonicalUrl&&<a href={item.canonicalUrl} target="_blank" rel="noreferrer nofollow">Referência canônica do produto · sem atribuição de comissão</a>}
    <small>Mensagem {date(item.messageAt)} · recebida {date(item.receivedAt)}</small>
   </li>)}
  </ol>:<p role="status">Nenhum link Shopee identificado nesta fila. Inicie o teste e envie uma nova mensagem com link de produto.</p>}
 </section>;
}
