import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const apply = process.argv.includes('--apply');
const demoEmails = ['mila@proximus.example','noah@kbc.example','lena@deloitte.example','eli@microsoft.example','ava@accenture.example'];
const demoDomains = ['proximus.example','kbc.example','deloitte.example','microsoft.example','accenture.example'];
try {
  const summary = await db.$transaction(async tx => {
    const settings = await tx.userSettings.findUnique({where:{id:'local'}});
    if(settings?.syncLeaseUntil && settings.syncLeaseUntil > new Date()) throw new Error('A Gmail sync is running. Wait for it to finish before removing examples.');
    const applications = await tx.application.findMany({where:{source:'Example data',notes:'Fictional example. Replace with your own application.'},select:{id:true,company:{select:{name:true}},jobTitle:true}});
    const contacts = await tx.contact.findMany({where:{email:{in:demoEmails},notes:'Fictional example contact.'},select:{id:true}});
    const ids = applications.map(a=>a.id);
    const demoMessages = await tx.emailMessage.count({where:{gmailMessageId:{startsWith:'demo-'}}});
    const realMessages = await tx.emailMessage.count({where:{NOT:{gmailMessageId:{startsWith:'demo-'}}}});
    const retainedApplications = await tx.application.count({where:{id:{notIn:ids}}});
    const summary = {mode:apply?'removed':'preview',demoApplications:applications.map(a=>`${a.company.name} · ${a.jobTitle}`),demoContacts:contacts.length,demoMessages,realMessagesRetained:realMessages,realApplicationsRetained:retainedApplications,gmailConnected:!!settings?.encryptedTokens};
    if(!apply)return summary;
    // Return real Gmail messages linked to fictional applications to the review inbox.
    await tx.emailMessage.updateMany({where:{thread:{applicationId:{in:ids}},NOT:{gmailMessageId:{startsWith:'demo-'}}},data:{reviewed:false,needsReview:true,suggestedApplicationId:null,matchConfidence:0,matchReason:'Fictional application removed. Please confirm the real application.'}});
    await tx.emailMessage.updateMany({where:{suggestedApplicationId:{in:ids}},data:{suggestedApplicationId:null}});
    await tx.emailMessage.deleteMany({where:{gmailMessageId:{startsWith:'demo-'}}});
    await tx.emailThread.deleteMany({where:{gmailThreadId:{startsWith:'demo-'},messages:{none:{}}}});
    // Seed activity text is exact; preserve any genuine synced activity on those entries.
    for(const a of applications){
      await tx.activity.deleteMany({where:{applicationId:a.id,message:{in:['Interested','Applied','Awaiting reply','Recruiter contacted','Assessment','Interview','Offer','Rejected','Withdrawn'].map(status=>`${a.company.name} · ${status}`)}}});
    }
    await tx.application.deleteMany({where:{id:{in:ids}}});
    await tx.contact.deleteMany({where:{id:{in:contacts.map(c=>c.id)}}});
    await tx.company.deleteMany({where:{domain:{in:demoDomains},applications:{none:{}},contacts:{none:{}}}});
    await tx.company.updateMany({where:{domain:{in:demoDomains}},data:{domain:null}});
    const afterSettings=await tx.userSettings.findUnique({where:{id:'local'}});
    if(JSON.stringify(settings)!==JSON.stringify(afterSettings))throw new Error('Settings preservation check failed; changes rolled back.');
    if(await tx.emailMessage.count({where:{NOT:{gmailMessageId:{startsWith:'demo-'}}}})!==realMessages)throw new Error('Real-message preservation check failed; changes rolled back.');
    if(await tx.application.count()!==retainedApplications)throw new Error('Real-application preservation check failed; changes rolled back.');
    return summary;
  });
  console.log(JSON.stringify(summary,null,2));
}finally {await db.$disconnect();}
