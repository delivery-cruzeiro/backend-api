type Hours = {date:Date|null;weekDay:number|null;openTime:Date|null;closeTime:Date|null;isClosed:boolean};
export function isStoreClosed(store:{openHour:Date|null;closeHour:Date|null;businessHours:Hours[]}, now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const part=(type:string)=>parts.find(x=>x.type===type)!.value;
 const date=`${part('year')}-${part('month')}-${part('day')}`;
 const weekDay=new Date(date+'T12:00:00Z').getUTCDay();
 const selected=store.businessHours.find(x=>x.date?.toISOString().slice(0,10)===date) || store.businessHours.find(x=>x.date===null && x.weekDay===weekDay);
 if(selected?.isClosed) return true;
 const open=selected?.openTime ?? store.openHour, close=selected?.closeTime ?? store.closeHour;
 if(!open || !close) return true;
 const seconds=(time:Date)=>time.getUTCHours()*3600+time.getUTCMinutes()*60+time.getUTCSeconds();
 const start=seconds(open),end=seconds(close),current=Number(part('hour'))*3600+Number(part('minute'))*60+Number(part('second'));
 if(start===end) return false;
 return end<start ? !(current>=start || current<end) : !(current>=start && current<end);
}
