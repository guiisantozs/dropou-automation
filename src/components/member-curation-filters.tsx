'use client';
import {operationCategories,type OperationId} from '@/lib/workspace-brands';
export const emptyMemberFilters={category:'all',sort:'relevance',minPrice:'',maxPrice:'',minRating:'',minSales:''};
export type MemberFilters=typeof emptyMemberFilters;
export default function MemberCurationFilters({operation,value,busy,onChange}:{operation:OperationId;value:MemberFilters;busy:boolean;onChange:(value:MemberFilters)=>void}){
 const update=(key:keyof MemberFilters,text:string)=>onChange({...value,[key]:text});
 return <form className="catalog-filters member-curation-filters" onSubmit={e=>e.preventDefault()} aria-label="Filtrar curadoria">
  <label>Categoria<select value={value.category} disabled={busy} onChange={e=>update('category',e.target.value)}><option value="all">Todas as categorias</option>{operationCategories[operation].map(category=><option key={category}>{category}</option>)}</select></label>
  <label>Ordenar seleção<select value={value.sort} disabled={busy} onChange={e=>update('sort',e.target.value)}><option value="relevance">Mais relevantes</option><option value="sales">Mais vendidos</option><option value="rating">Melhor avaliados</option><option value="price">Menor preço</option></select></label>
  {([['minPrice','Preço mínimo',.01,1e6],['maxPrice','Preço máximo',.01,1e6],['minRating','Nota mínima',.1,5],['minSales','Vendas mínimas',1,1e9]] as const).map(([key,label,step,max])=><label key={key}>{label}<input type="number" min="0" max={max} step={step} value={value[key]} disabled={busy} placeholder="Qualquer" onChange={e=>update(key,e.target.value)}/></label>)}
  <button type="button" className="secondary" disabled={busy} onClick={()=>onChange({...emptyMemberFilters})}>Limpar filtros</button>
  <p>Nota e vendas são as informadas pela Shopee. Itens sem esses dados ficam fora do filtro correspondente. Vendas não comprovam tendência recente ou reputação da loja.</p>
 </form>;
}
