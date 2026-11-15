export default function WorkspaceLoading({label='Carregando produtos…'}:{label?:string}){
 return <div className="refined-loading" role="status" aria-label={label}><span className="sr-only">{label}</span>{[0,1,2].map(i=><div className="refined-loading-card" aria-hidden="true" key={i}><span/><div><i/><i/><i/></div></div>)}</div>;
}
