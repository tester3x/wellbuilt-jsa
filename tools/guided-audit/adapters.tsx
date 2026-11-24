// Test-only UI/platform dependencies; the guided screen implementations are unchanged.
import React from 'react';
import {JSA_STEPS,PPE_ITEMS,PREPARED_FOR_WORK_ITEMS} from '../../constants/jsaTemplate';
import {app,auth,owner} from './runtime';
export {app};
export const assessment={steps:JSA_STEPS,ppeItems:PPE_ITEMS,preparedItems:PREPARED_FOR_WORK_ITEMS};
const noop=()=>{};
const theme={accent:'#DAA520',accentDim:'#DAA52033',companyName:'Emulator test only',logoUrl:null,companyAddress:'',companyPhone:'',assignedOperators:[],emergencyContacts:[],companyContacts:[],jsaTemplate:assessment,jobTypes:['Production Water'],activePackages:[],backgroundPackageId:'water',setBackgroundPackageId:noop,resolveBackgroundPackageForJob:()=>null,loading:false,configLoaded:true,refresh:async()=>{}};
export const useTheme=()=>theme;
export const ThemeProvider=({children}:any)=><>{children}</>;
export const fetchDriverProfile=async()=>null;
export const loadUsableGovernedSession=async()=>null;
export const getGovernedAuth=()=>auth;
export const awaitGovernedAuthReady=()=>auth.authStateReady();
export const preparedShiftJsa={};
export const standaloneCall=async()=>{throw Error('Standalone is outside this governed audit');};
export const standaloneAccess=async()=>false;
const router={replace:()=>{throw Error('Unexpected router transition in isolated guided test');},push:()=>{throw Error('Unexpected router transition');},back:noop,canGoBack:()=>false};
export const useRouter=()=>router;
export const useLocalSearchParams=()=>({});
export const Stack={Screen:()=>null};
export default function AuditMenu(){return null;}
