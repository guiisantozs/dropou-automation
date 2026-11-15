'use client';
import {useEffect} from 'react';
import {selectedOperation} from '@/lib/workspace-brands';
export default function OperationTheme(){useEffect(()=>{const update=()=>{document.documentElement.dataset.operation=selectedOperation();};update();window.addEventListener('popstate',update);window.addEventListener('dropou:operation-change',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('dropou:operation-change',update);};},[]);return null;}
