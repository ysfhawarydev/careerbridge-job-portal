'use client';
import {use,useEffect,useState} from 'react';
import Link from 'next/link';
import {api} from '../../../../lib/api';
type Applicant={id:string;full_name:string;email:string;status:string;cover_letter:string;created_at:string};
export default function Applicants({params}:{params:Promise<{id:string}>}){
 const {id}=use(params),[items,setItems]=useState<Applicant[]>([]),[error,setError]=useState('');
 async function refresh(){try{setItems(await api<Applicant[]>('/employer/jobs/'+id+'/applications'))}catch(e:any){setError(e.message)}}
 useEffect(()=>{refresh()},[id]);
 async function update(id:string,status:string){try{await api('/employer/applications/'+id,{method:'PATCH',body:JSON.stringify({status})});await refresh()}catch(e:any){setError(e.message)}}
 return <main className="max-w-4xl mx-auto px-5 py-12"><Link href="/dashboard" className="text-blue-600">← Dashboard</Link><h1 className="text-3xl font-bold mt-5 mb-8">Job applicants</h1>{error&&<p role="alert" className="text-red-600">{error}</p>}{items.length===0?<div className="card">No applications yet.</div>:<div className="space-y-4">{items.map(a=><article key={a.id} className="card"><h2 className="font-bold text-lg">{a.full_name}</h2><p className="text-slate-500">{a.email}</p><p className="mt-4 whitespace-pre-wrap">{a.cover_letter||'No cover letter provided.'}</p><div className="flex items-center gap-3 mt-5"><label className="label">Status</label><select className="max-w-48" value={a.status} onChange={e=>update(a.id,e.target.value)}>{['submitted','reviewing','shortlisted','rejected','hired'].map(s=><option key={s} value={s} disabled={s==='submitted'&&a.status!=='submitted'}>{s}</option>)}</select></div></article>)}</div>}</main>
}
