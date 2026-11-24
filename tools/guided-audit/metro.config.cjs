const path=require('node:path');
const {getDefaultConfig}=require('expo/metro-config');
const root=path.resolve(__dirname,'../..'),config=getDefaultConfig(root);
console.log('Guided audit Metro config: registered homes, isolated adapters');
const tickets='C:/dev/TicketTimeExpo/tmp/wbt-jobtype-regression';
config.watchFolders=[tickets];
config.resolver.nodeModulesPaths=[path.join(root,'node_modules')];
const adapter=path.join(__dirname,'adapters.tsx');
const endings=['/app/contexts/ThemeContext','/services/firebase','/services/driverAuth','/services/preparedShiftJsa','/services/standaloneJsa','/services/sso/jsaGovernedAuthLive','/components/MoreMenu'];
config.resolver.resolveRequest=(ctx,name,platform)=>{
 if(name.endsWith('/utils/jsaHandoffCoordinator')||name.endsWith('/utils/jsaStartGateCore'))return {type:'sourceFile',filePath:path.join(tickets,'utils',name.split('/').at(-1)+'.ts')};
 const absolute=name.startsWith('.')?path.resolve(path.dirname(ctx.originModulePath),name).replaceAll('\\','/'):name;
 if(name==='expo-router'||endings.some(s=>absolute===root.replaceAll('\\','/')+s))return {type:'sourceFile',filePath:adapter};
 return ctx.resolveRequest(ctx,name,platform);
};
module.exports=config;
