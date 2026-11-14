import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('./assistant-engine.mjs').catch(()=>({}));
const request=()=>({state:{mode:'free',first:'radiant',history:[],pool:[]},side:'radiant',type:'pick',role:1,personalPool:[1,8,42],metaMode:'fresh'});
test('assistant exposes the real calculation adapter',()=>assert.equal(typeof mod.analyzeDraft,'function'));
test('personal pool excludes other candidates without changing lobby pool',()=>{
 const q=request(),r=mod.analyzeDraft(q);assert.ok(r.candidates.length>0);assert.ok(r.candidates.every(x=>[1,8,42].includes(x.id)));assert.deepEqual(q.state.pool,[]);
});
test('used hero and occupied role cannot be recommended',()=>{
 const q=request();q.state.history=[{id:1,type:'pick',side:'radiant',role:1}];assert.equal(mod.analyzeDraft(q).candidates.length,0);
 q.role=0;assert.ok(mod.analyzeDraft(q).candidates.every(x=>x.id!==1));
});
test('unknown IDs, duplicate heroes and inconsistent turn order rejected',()=>{
 for(const change of [q=>q.state.history.push({id:99999,type:'pick',side:'radiant',role:1}),q=>q.personalPool=[99999],q=>q.state.history=[{id:1,type:'pick',side:'radiant',role:1},{id:1,type:'ban',side:'dire',role:0}],q=>{q.state.mode='cm';q.state.history=[{id:1,type:'pick',side:'radiant',role:1}]},q=>q.role=8]){const q=request();change(q);assert.throws(()=>mod.analyzeDraft(q));}
});
test('snapshot carries data limits and finite scores',()=>{
 const r=mod.analyzeDraft(request());assert.equal(r.source.matches,49919);assert.equal(r.source.roleSpecific,false);assert.ok(r.candidates.every(x=>Number.isFinite(x.score)));assert.ok(r.limitations.length>0);
});
test('real ban history with null role remains valid for assistant',()=>{
 const q=request();q.state={mode:'cm',first:'radiant',pool:[],history:[{id:1,type:'ban',side:'radiant',role:null}]};q.type='ban';q.role=0;
 const r=mod.analyzeDraft(q);assert.ok(r.candidates.length>0);assert.ok(r.candidates.every(x=>x.id!==1));
});
test('explicit comparison includes eligible heroes beyond top six',()=>{
 const q=request();q.personalPool=[];q.compareIds=[1,8];const r=mod.analyzeDraft(q);assert.deepEqual(new Set(r.candidates.map(x=>x.id)),new Set([1,8]));
});
test('complete draft exposes team risks even with no candidates',()=>{
 const q=request();q.personalPool=[];q.state.history=[['radiant',[67,25,2,3,5]],['dire',[8,76,129,71,31]]].flatMap(([side,ids])=>ids.map((id,i)=>({id,side,type:'pick',role:i+1})));
 const r=mod.analyzeDraft(q);assert.equal(r.candidates.length,0);assert.ok(r.compositionRisks.length>0);assert.ok(r.compositionRisks.every(x=>x.id.startsWith('composition:')));
});
