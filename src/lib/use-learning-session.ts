"use client";
import {useEffect,useRef} from 'react';
/** One signed refresh per ready wallet session; failures require an explicit retry. */
export function useLearningSession({wallet,ready,blocked,refresh}:{wallet:string;ready:boolean;blocked:boolean;refresh:()=>Promise<unknown>}){
 const attempted=useRef(''),latest=useRef(refresh);latest.current=refresh;
 useEffect(()=>{
  if(!wallet||!ready){attempted.current='';return;}
  if(blocked||attempted.current===wallet)return;
  attempted.current=wallet;void latest.current().catch(()=>{});
 },[wallet,ready,blocked]);
}
