const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ids=require('../ids.js');
test('creates valid distinct IDs without randomUUID (HTTP and older browsers)',()=>{const source={getRandomValues:a=>crypto.webcrypto.getRandomValues(a)};const generated=new Set();for(let i=0;i<500;i++){const id=ids.create(source);assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);generated.add(id);}assert.equal(generated.size,500);});
test('uses randomUUID when available and reports unsupported browsers clearly',()=>{assert.equal(ids.create({randomUUID:()=> 'native-id'}),'native-id');assert.throws(()=>ids.create({}),/Brskalnik ne podpira/);});
