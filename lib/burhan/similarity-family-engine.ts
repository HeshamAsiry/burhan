import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";

type AyahRow = { id: string; surah_id: number; ayah_number: number; text_ar: string; normalized_text: string };
export type SimilarityFamilyMember = AyahRow & { difference_point: string | null; similarity_score: number };
export type SimilarityFamily = { name: string; description: string; difficulty: number; similarity_score: number; members: SimilarityFamilyMember[] };

const DEFAULT_THRESHOLD = 0.45;
function words(text: string) { return normalizeArabic(text).split(/\s+/).filter(Boolean); }
function prefix(a: string[], b: string[]) { let i=0; while(i<a.length&&i<b.length&&a[i]===b[i]) i++; return i; }
function suffix(a: string[], b: string[], p: number) { let i=0; while(i<a.length-p&&i<b.length-p&&a[a.length-1-i]===b[b.length-1-i]) i++; return i; }
function compare(a: AyahRow,b: AyahRow) {
  const aw=words(a.normalized_text), bw=words(b.normalized_text); const p=prefix(aw,bw); const s=suffix(aw,bw,p);
  const score=Number(Math.max(0,Math.min(1,(p+s)/Math.max(aw.length,bw.length,1))).toFixed(4));
  const left=aw.slice(p,aw.length-s).join(" "), right=bw.slice(p,bw.length-s).join(" ");
  return { score, sharedWords:p+s, differencePoint:left||right?`${left} ⇄ ${right}`:null };
}
function components(rows: AyahRow[], threshold: number) {
  const graph=new Map<string,Set<string>>(); rows.forEach(r=>graph.set(r.id,new Set()));
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) { const c=compare(rows[i],rows[j]); if(c.score>=threshold||c.sharedWords>=2){graph.get(rows[i].id)!.add(rows[j].id);graph.get(rows[j].id)!.add(rows[i].id);} }
  const seen=new Set<string>(), out:AyahRow[][]=[];
  for(const row of rows){ if(seen.has(row.id)) continue; const q=[row.id], ids=new Set<string>(); seen.add(row.id); while(q.length){const id=q.shift()!;ids.add(id);for(const n of graph.get(id)??[]){if(!seen.has(n)){seen.add(n);q.push(n);}}} const group=rows.filter(r=>ids.has(r.id)); if(group.length>=2) out.push(group); }
  return out;
}
function familyName(rows: AyahRow[]) { const lists=rows.map(r=>words(r.normalized_text)); const p:string[]=[]; for(let i=0;;i++){const t=lists[0]?.[i];if(!t||lists.some(x=>x[i]!==t))break;p.push(t);} return p.slice(0,5).join(" ")||"Similarity family"; }
function difficulty(size:number,score:number){const sizeSignal=Math.min(3,Math.max(0,size-2));const sim=score>=.85?3:score>=.7?2:1;return Math.min(7,Math.max(1,sizeSignal+sim+1));}

export async function buildSimilarityFamilies(input:{anchor:string;threshold?:number;limit?:number;persist?:boolean;juz?:number}){
  const db=getSupabaseAdmin(), normalizedAnchor=normalizeArabic(input.anchor); if(!normalizedAnchor) throw new Error("Anchor becomes empty after normalization.");
  const threshold=Math.max(.2,Math.min(input.threshold??DEFAULT_THRESHOLD,.95)), limit=Math.max(2,Math.min(input.limit??30,50));
  const {data,error}=await db.rpc("burhan_find_anchor_ayahs",{p_anchor:normalizedAnchor,p_limit:limit,p_juz:input.juz??null}); if(error) throw new Error(error.message);
  const rows=(data??[]) as AyahRow[], groups=components(rows,threshold);
  const families:SimilarityFamily[]=groups.map(group=>{
    const scores:number[]=[]; const members=group.map(row=>{let best=0,diff:string|null=null;for(const other of group){if(other.id===row.id)continue;const c=compare(row,other);scores.push(c.score);if(c.score>best){best=c.score;diff=c.differencePoint;}}return {...row,difference_point:diff,similarity_score:best};});
    const score=scores.length?Number((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(4)):0;
    return {name:familyName(group),description:`Generated from anchor "${input.anchor}" using deterministic Quran-text similarity.`,difficulty:difficulty(group.length,score),similarity_score:score,members};
  });
  if(input.persist!==false&&families.length){
    const {data:anchor,error:ae}=await db.from("anchors").select("id").eq("normalized_text",normalizedAnchor).limit(1).maybeSingle(); if(ae)throw new Error(ae.message);
    if(anchor?.id){const {data:old, error:oe}=await db.from("similarity_groups").select("id").eq("anchor_id",anchor.id);if(oe)throw new Error(oe.message);const ids=(old??[]).map(x=>x.id);if(ids.length){const {error:e1}=await db.from("similarity_group_members").delete().in("group_id",ids);if(e1)throw new Error(e1.message);const {error:e2}=await db.from("similarity_groups").delete().in("id",ids);if(e2)throw new Error(e2.message);}
      for(const family of families){const {data:g,error:ge}=await db.from("similarity_groups").insert({name:family.name,description:family.description,difficulty:family.difficulty,anchor_id:anchor.id,occurrence_count:family.members.length,similarity_score:family.similarity_score,threshold}).select("id").single();if(ge)throw new Error(ge.message);const {error:me}=await db.from("similarity_group_members").insert(family.members.map(m=>({group_id:g.id,ayah_id:m.id,difference_point:m.difference_point,similarity_score:m.similarity_score})));if(me)throw new Error(me.message);}
    }
  }
  return {anchor:input.anchor,normalized_anchor:normalizedAnchor,threshold,occurrences_found:rows.length,juz:input.juz??null,families};
}
