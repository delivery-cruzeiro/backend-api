import {prisma} from '../dist/lib/prisma.js';
const models = {
 user:['phone'], account:['accessToken','refreshToken','idToken'],
 paymentMethod:['providerId','cardHolder'], fiscalDocument:['xmlContent'],
};
try {
 for (const [model,fields] of Object.entries(models)) {
  let cursor;
  let count=0;
  while(true) {
   const rows=await prisma[model].findMany({take:100,orderBy:{id:'asc'},...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,...Object.fromEntries(fields.map(field=>[field,true]))}});
   if(!rows.length) break;
   for(const row of rows) {
    const data=Object.fromEntries(fields.filter(field=>typeof row[field]==='string').map(field=>[field,row[field]]));
    if(Object.keys(data).length) await prisma[model].update({where:{id:row.id},data});
    count++;
   }
   cursor=rows.at(-1).id;
  }
  console.log(`${model}: ${count} records processed`);
 }
} finally {await prisma.$disconnect();}
