export const API=process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000';
export async function api<T=unknown>(path:string,options:RequestInit={}):Promise<T>{
 const headers=new Headers(options.headers);
 if(options.body!=null && typeof options.body==='string' && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
 const res=await fetch(API+path,{...options,credentials:'include',headers,cache:'no-store'});
 const raw=await res.text();
 let data:any={};
 if(raw){try{data=JSON.parse(raw)}catch{throw new Error(`Invalid API response (${res.status})`)}}
 if(!res.ok)throw new Error(data?.error??data?.message??`Request failed (${res.status})`);
 return data as T;
}
export type User={id:string;full_name:string;email:string;role:'seeker'|'employer'|'admin'};
export type Job={id:string;title:string;description:string;location:string;type:string;company_name:string;salary_min:number|null;salary_max:number|null;created_at:string;applicants?:number};
