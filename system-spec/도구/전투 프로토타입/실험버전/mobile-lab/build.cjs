const fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
let html=read('index.html'),css=read('style.css').replace(/^@import[^;]+;\s*/,''),app=read('app.js');
const chars={};for(const id of ['isaac','angelica','mercan','holy_lancer','holy_shield','tower_guard'])chars[id]='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../v5/public/assets/characters/'+id+'.png')).toString('base64');
const bg='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../v5/public/assets/environment/highland-final-web.png')).toString('base64');
css=css.replaceAll('../v5/public/assets/environment/highland-final-web.png',bg);app=app.replace("art=id=>'../v5/public/assets/characters/'+id+'.png'",'art=id=>'+JSON.stringify(chars)+'[id]');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+css+'</style>').replace('<script src="model.js"></script>',()=>'<script>'+read('model.js')+'</script>').replace('<script src="app.js"></script>',()=>'<script>'+app+'</script>');
fs.mkdirSync(path.join(__dirname,'standalone'),{recursive:true});fs.writeFileSync(path.join(__dirname,'standalone/index.html'),html);console.log('Standalone created:',Buffer.byteLength(html),'bytes');
