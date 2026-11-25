'use strict';
const {recipientsOf}=require('./reminders.cjs');
const escapeText=v=>String(v??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const stamp=v=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
// RFC 5545: fold at 75 octets, without splitting UTF-8 characters.
function fold(line){
 let out='',part='',size=0;
 for(const ch of line){const n=Buffer.byteLength(ch);if(size+n>75){out+=part+'\r\n';part=' ';size=1}part+=ch;size+=n}
 return out+part;
}
function buildCalendar(rows,{now=new Date()}={}){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ContentScale//Scheduled Reminders//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:ContentScale - Scheduled Reminders','X-WR-TIMEZONE:UTC'];
 for(const r of rows){
  const due=new Date(r.reminder_due_at);
  if(!Number.isFinite(due.getTime()))continue;
  const recipients=recipientsOf(r).filter(e=>typeof e==='string'&&e.includes('@'));
  if(!recipients.length)continue;
  lines.push('BEGIN:VEVENT','UID:growth-reminder-'+r.public_id+'@contentscale.site','DTSTAMP:'+stamp(now),'DTSTART:'+stamp(due),'DTEND:'+stamp(new Date(due.getTime()+15*60000)),
   'SUMMARY:'+escapeText('Scheduled reminder: '+r.host),
   'DESCRIPTION:'+escapeText('Planned send (not delivery confirmation)\nURL: '+r.url+'\nSearch term: '+(r.query||'')+'\nRecipients: '+recipients.join(', ')),
   'CLASS:PRIVATE','TRANSP:TRANSPARENT','END:VEVENT');
 }
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
module.exports={buildCalendar,escapeText,fold};
