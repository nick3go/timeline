const fs=require('node:fs');
let html=fs.readFileSync('index.html','utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync('style.css','utf8')+'</style>');
for(const file of ['config.js','dates.js','app.js'])html=html.replace(`<script src="${file}"></script>`,()=>'<script>'+fs.readFileSync(file,'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
fs.writeFileSync('backend/App.html',html);
fs.writeFileSync('backend/Dates.gs',fs.readFileSync('dates.js','utf8'));
console.log('Built backend/App.html and backend/Dates.gs');
