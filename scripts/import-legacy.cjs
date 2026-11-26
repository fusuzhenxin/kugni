/* One-time, explicit migration from the approved prototype, never a runtime dependency. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),legacy=path.resolve(root,'..');
function readWindow(file,key){const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(legacy,file),'utf8'),context);return context.window[key];}
fs.mkdirSync(path.join(root,'shared'),{recursive:true});
const catalog=readWindow('output/admin-full-ui-20261124/catalog.js','KUGNI_CATALOG');
const routes=require(path.join(legacy,'site-routes.js')),config=require(path.join(legacy,'site-config.js')),content=require(path.join(legacy,'page-content.js'));
const modules=catalog.modules;
// A real secret is sent once to the backend and encrypted. Model discovery is an action.
const keys=modules.find(m=>m.key==='test-keys');
keys.fields=keys.fields.filter(f=>!['secretRef','modelScope'].includes(f.key));
keys.fields.splice(2,0,{key:'secret',label:'API Key（仅写入）',type:'password',help:'创建必填，编辑留空保留。保存后只显示脱敏标识，模型从服务商自动获取。'});
keys.fields.push({key:'baseUrl',label:'接口基础地址',type:'url',required:true});
keys.actions.push('discover');
const plans=modules.find(m=>m.key==='plans');
plans.fields=plans.fields.filter(f=>f.key!=='keyPolicy');
const users=modules.find(m=>m.key==='users');users.fields.push({key:'password',label:'登录密码（仅写入）',type:'password'});
const roles=modules.find(m=>m.key==='roles');roles.fields.push({key:'permissions',label:'功能权限',type:'permissions'});
for(const key of ['seo','settings','p-account']){const m=modules.find(m=>m.key===key);m.fields=key==='seo'?[{key:'name',label:'页面名称',required:true},{key:'path',label:'页面路径',required:true},{key:'title',label:'SEO 标题',required:true},{key:'description',label:'页面描述',type:'textarea',required:true},{key:'keywords',label:'关键词'},{key:'index',label:'允许收录',type:'select',options:['是','否']}]:key==='settings'?[{key:'name',label:'网站名称',required:true},{key:'description',label:'网站介绍',type:'textarea'},{key:'email',label:'联系邮箱',type:'email'},{key:'qq',label:'QQ'},{key:'telegram',label:'Telegram',type:'url'}]:[{key:'name',label:'联系人',required:true},{key:'email',label:'联系邮箱',type:'email'},{key:'company',label:'公司名称'},{key:'domain',label:'推广网站',type:'url'}];}
const permissions=modules.flatMap(m=>['read',...m.actions].map(action=>({code:m.permission+'.'+action,module:m.key,action,group:m.group,title:m.title})));
const data={config,routes:routes.entries,stationSlugs:Object.fromEntries(routes.stations),source:readWindow('data-sites.js','KUGNI_SOURCE'),models:JSON.parse(fs.readFileSync(path.join(legacy,'data/v1/models.json'),'utf8')),pricing:JSON.parse(fs.readFileSync(path.join(legacy,'data/v1/pricing.json'),'utf8')),content};
fs.writeFileSync(path.join(root,'shared/seed.json'),JSON.stringify(data,null,2));
fs.writeFileSync(path.join(root,'shared/catalog.json'),JSON.stringify({modules,permissions,actions:catalog.actions},null,2));
const publicDir=path.join(root,'web/public');fs.mkdirSync(publicDir,{recursive:true});
for(const dir of ['brands','stations','payments','illustrations','og'])fs.cpSync(path.join(legacy,'assets',dir),path.join(publicDir,'assets',dir),{recursive:true});
for(const file of ['favicon.svg','favicon.ico','favicon-48.png','favicon-96.png','favicon-192.png','favicon-512.png','apple-touch-icon.png','site.webmanifest'])fs.copyFileSync(path.join(legacy,file),path.join(publicDir,file));
console.log(`Imported ${data.source.sites.length} stations, ${modules.length} management modules, ${data.routes.length} routes.`);
