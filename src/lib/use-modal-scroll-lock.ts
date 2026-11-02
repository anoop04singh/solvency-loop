"use client";
import {useEffect} from 'react';
const locks=new Set<symbol>();let original='';
export function useModalScrollLock(open:boolean){
 useEffect(()=>{if(!open)return;const token=Symbol();if(!locks.size){original=document.body.style.overflow;document.body.style.overflow='hidden';}locks.add(token);return()=>{locks.delete(token);if(!locks.size)document.body.style.overflow=original;};},[open]);
}
