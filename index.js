const express = require('express');
const bodyparser = require('body-parser');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const stream = require('stream');
const multer = require('multer');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const App = express();
const expressWS = require('express-ws')(App);
const sharp = require("sharp");

dotenv.config();


const storage = multer.memoryStorage();

const upload = multer({
    limits: { fieldSize: 25 * 1024 * 1024 },
    storage
});

const {
    PRIVATE_KEY,
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    REFRESH_TOKEN,
    ACCESS_TOKEN
} = process.env;

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
    );
    
oauth2Client.setCredentials({refresh_token:REFRESH_TOKEN});

const drive = google.drive({ version: 'v3',auth:oauth2Client });



const uploadFile = async (fileObject) => {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(await sharp(fileObject.buffer).webp({ quality: 20 }).toBuffer());

    const { data } = await drive.files.create({
      media: {
        mimeType: fileObject.mimeType,
        body: bufferStream,
      },
      requestBody: {
        name: fileObject.originalname,
      },
    });
    return data;
};

const deleteFile = async (id) => {
    await drive.files.delete({
        fileId:id
    });
};

function getFullDate(){
    return moment.utc().toISOString(); 
}

const transport = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    auth: {
      user: "0a077fbe86b222",
      pass: "e1be5769eebb0a"
    }
  });

// token log
let TOKEN_LOG = {};


// token cleaner log
setInterval(()=>{
    for (let time in TOKEN_LOG){
        const new_date = moment(getFullDate());
        const old_date = moment(time);
        const diff = moment.duration(new_date.diff(old_date)).asDays();
        if (diff > 7){
            delete TOKEN_LOG[time];
        }
    }
},1000 * 60 * 60 );


const connection = mysql.createPool(process.env.DATABASE_URL);



const PORT = 4055;



App.use(bodyparser.urlencoded({extended:0}));
App.use(bodyparser.json());
App.use((req,res,next)=>{
    res.set("Access-Control-Allow-Origin",'*');
    res.set("Access-Control-Allow-Headers",'*');
    next()
});


App.get('/', (req,res)=>{
    connection.query("select * from Accounts",(err,result)=>{
        if (err){
            res.json({'success':false,'msg':err});
            return
        }
        res.json({'success':true,'msg':result});
    });
});

// login to account
App.post('/login', (req,res)=>{
    const email    = req.body.email;
    const password = req.body.password;
    connection.query("select * from Accounts where email = ? and password = ?",[email,password],async (err,result)=>{
        if (err){
            return res.json({'success':false,'msg':err});
        }
        if (!result.length){
            return res.json({'success':false,'msg':"Wrong Credentials"});
        }
        const token = jwt.sign({email,password,id:result[0].id},PRIVATE_KEY, { expiresIn: 60 * 60 * 24 * 30 });
        TOKEN_LOG[getFullDate()] ? TOKEN_LOG[getFullDate()].push(token) : TOKEN_LOG[getFullDate()] = [token];
        res.json({'success':true,'msg':{token,pfp:result[0].image.replace('download','view'),lang:result[0].language,theme:result[0].theme}});
    });
});

// check login
App.post('/check', (req,res)=>{
    const token = req.body.token;
    if(!token){
        return res.json({'success':false})
    }
    
    for (let time in TOKEN_LOG){
        for (tk in TOKEN_LOG[time]){
            if(token === TOKEN_LOG[time][tk]){
                return res.json({'success':true})
            }
        }
    }

    const jwt_verification = jwt.verify(token,PRIVATE_KEY);
    const expiration_check = moment.duration(moment(getFullDate()).subtract('seconds',jwt_verification.exp)).asDays()
    if (expiration_check >= 0){
        return res.json({'success':false})
    }
    TOKEN_LOG[getFullDate()] ? TOKEN_LOG[getFullDate()].push(token) : TOKEN_LOG[getFullDate()] = [token];
    return res.json({'success':true})
    
});

// send recovery code
App.post('/forgot', (req,res)=>{
    const email = req.body.email;
    connection.query("select * from Accounts where email = ?",[email],async (err,result)=>{
        if(!result.length){
            return res.json({'success':false,'msg':'No account with this email'});
        }

        const code = `${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}`;
        await transport.sendMail({
            from:'support@whub.com',
            to:email,
            subject:'password recovery request',
            text:`your recovery code is ${code}`
        });

        connection.query("insert into Accounts_recovery values (Null,?,?,false,CURRENT_TIMESTAMP)",[result[0].email,code],(err,result)=>{
            return res.json({'success':true});
        })
    });
});

// verify recovery code
App.post('/validate', (req,res)=>{
    const email = req.body.email;
    const code = req.body.code;
    connection.query("select *,CURRENT_TIMESTAMP from Accounts_recovery where email = ? and used = 0 order by id desc",[email],async (err,result)=>{
        if(!result.length || result[0].code !== code || moment.duration(moment(result[0]['current_timestamp()']).diff(moment(result[0].creation_date))).asMinutes() > 15){
            return res.json({'success':false});
        }


        connection.query("UPDATE Accounts_recovery set used = 1 where id = ?",[result[0].id],(err,result)=>{
            
            return res.json({'success':true});
        })
    });
});

// change pass
App.post('/change_pass', (req,res)=>{
    const email = req.body.email;
    const code = req.body.code;
    const password = req.body.password;
    connection.query("select *,CURRENT_TIMESTAMP from Accounts_recovery where email = ? and used = 1 order by id desc",[email],async (err,result)=>{
        if(!result.length || result[0].code !== code){
            return res.json({'success':false});
        }


        connection.query("UPDATE Accounts set password = ? where email = ?",[password,email],(err,result)=>{
            
            return res.json({'success':true});
        })
    });
});

// create account
App.post('/signup',upload.any(), async (req, res) => {
    const { body, files } = req;
    const Account = JSON.parse(body.Account);
    connection.query("select * from Accounts where email = ? or username = ?",[Account.email,Account.username],async (err,result)=>{
        if (result.length){
            return res.json({'success':false,'msg':result[0].email === Account.email ?  "Email already in use" :"Username already in use"});
        }
        Account["image"] = {webContentLink:''};
        if(files[0]){
            const imgId = await uploadFile(files[0]);
            await drive.permissions.create({
                fileId:imgId.id,
                requestBody:{
                    role:"reader",
                    type:"anyone"
                }
            }).then(()=>{
                return
            })
            Account["image"] = await drive.files.get({
                fileId:imgId.id,
                fields:'webContentLink'
            }).then((res)=>{
                return res.data
            });
        }
        connection.query("insert into Accounts values (Null,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",[Account.username,Account.first_name,Account.last_name,Account.email,Account.password,Account.image.webContentLink.replace('download','view'),'ENG','Dark'],(err,result)=>{
            if (err){

                return res.json({'success':false,'msg':err});
            }
            const token = jwt.sign({email:Account.email,password:Account.password,id:result.insertId},PRIVATE_KEY, { expiresIn: 60 * 60 * 24 * 30 });
            TOKEN_LOG[getFullDate()] ? TOKEN_LOG[getFullDate()].push(token) : TOKEN_LOG[getFullDate()] = [token];
            res.json({'success':true,'msg':{token,pfp:Account["image"].webContentLink.replace('download','view'),lang:'ENG',theme:'Dark'}});
        });
        // res.json({'success':false,'msg':"{token}"});
    });
});

// get friends
App.post('/friends', async (req, res) => {
    const { body } = req;
    const { token } = body;

    const tokendata  = jwt.verify(token,PRIVATE_KEY);

    connection.query("select id,image,username,email,fname,lname from Accounts where id <> ?",[tokendata.id],async (e,r)=>{
        connection.query('select * from Friends where f1 = ? or f2 = ?',[tokendata.id,tokendata.id],(err,result)=>{
            for (let i in r){
                r[i]['isfriend'] = false;
                r[i]['friend_requested'] = false;
            }
            for (let i in r){
                r[i].image = r[i].image.replace('download','view') 
                for (let y in result){
                    if ([result[y].f1,result[y].f2].includes(r[i].id)){
                        r[i]['isfriend'] = true;
                    }
                    
                }
            }
            connection.query('select * from Friend_Requests where from_acc = ?',[tokendata.id],(err,result)=>{
                
                for (let i in r){
                    for (let y in result){
                        if (result[y].to_acc === r[i].id){
                            r[i]['friend_requested'] = true;
                        }
                        
                    }
                }
                res.json({success:true,msg:r});
            });

        })
    });
});

// delete friend
App.post('/friends/delete', async (req, res) => {
    const { body } = req;
    const { token, id } = body;
  
    const tokendata = jwt.verify(token, PRIVATE_KEY);
  
    connection.beginTransaction(async (err) => {
      if (err) {
        throw err;
      }
  
      try {
        // Get the conversations of type 'direct' involving the two friends
        const conversations = await new Promise((resolve, reject) => {
          connection.query(
            `
            SELECT c.id
            FROM Conversation c
            INNER JOIN Conversation_Participent cp ON c.id = cp.conversation
            WHERE c.type = 'direct'
            AND cp.participent IN (?, ?)
            GROUP BY c.id
            HAVING COUNT(DISTINCT cp.participent) = 2
            `,
            [tokendata.id, id],
            (error, results) => {
              if (error) {
                reject(error);
              } else {
                resolve(results);
              }
            }
          );
        });
  
        // Delete the messages associated with the conversations
        for (const conversation of conversations) {
          await new Promise((resolve, reject) => {
            connection.query(
              'DELETE FROM Conversation_Message WHERE Autor IN (SELECT id FROM Conversation_Participent WHERE conversation = ?)',
              [conversation.id],
              (error) => {
                if (error) {
                  reject(error);
                } else {
                  resolve();
                }
              }
            );
          });
        }
  
        // Delete the conversation participants associated with the conversations
        await new Promise((resolve, reject) => {
          connection.query(
            'DELETE FROM Conversation_Participent WHERE conversation IN (SELECT id FROM Conversation WHERE type = "direct")',
            (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            }
          );
        });
  
        // Delete the conversations of type 'direct'
        await new Promise((resolve, reject) => {
          connection.query(
            'DELETE FROM Conversation WHERE type = "direct"',
            (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            }
          );
        });
  
        // Delete the friendship
        await new Promise((resolve, reject) => {
          connection.query(
            'DELETE FROM Friends WHERE (f1 = ? OR f2 = ?) AND (f1 = ? OR f2 = ?)',
            [tokendata.id, tokendata.id, id, id],
            (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            }
          );
        });
  
        // Commit the transaction
        connection.commit((error) => {
          if (error) {
            throw error;
          }
  
          res.json({ success: true });
        });
      } catch (error) {
        // Rollback the transaction in case of any error
        connection.rollback(() => {
          throw error;
        });
      }
    });
  });
  
// request friend
App.post('/friends/request', async (req, res) => {
    const { body } = req;
    const { token, id } = body;

    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    

    connection.query("insert into Friend_Requests values (?, ?,CURRENT_TIMESTAMP)",[tokendata.id,id],async (e,r)=>{
        res.json({success:true});
    });
});
// actions with friend request 
App.post('/friends/request/get', async (req, res) => {
    const { body } = req;
    const { token } = body;

    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    
    connection.query("SELECT Accounts.id,Accounts.lname,Accounts.fname,Accounts.username,Accounts.image FROM Friend_Requests,Accounts where Friend_Requests.from_acc = Accounts.id and Friend_Requests.to_acc = ?",[tokendata.id],async (e,r)=>{
        res.json({success:true,msg:r});
    });
});

// actions with friend request 
App.post('/friends/request/action', async (req, res) => {
    const { body } = req;
    const { token, id, action } = body;

    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    if (action == 'accept'){
        connection.query("DELETE FROM Friend_Requests where to_acc = ? and from_acc = ?",[tokendata.id,id],async (e,r)=>{
            connection.query("insert into Friends values (?, ?,CURRENT_TIMESTAMP)",[tokendata.id,id],async (e,r)=>{
                connection.query("insert into Conversation values (NULL,'','','direct',CURRENT_TIMESTAMP)",[],(err,result)=>{
                    connection.query(`insert into Conversation_Participent values (NULL,${result.insertId},?,'member',CURRENT_TIMESTAMP),(NULL,${result.insertId},?,'member',CURRENT_TIMESTAMP)`,[tokendata.id,id],(err,result)=>{
                        res.json({success:true});
                    });
                });
            });
        });
    }
    else if (action == 'decline'){
        connection.query("DELETE FROM Friend_Requests where to_acc = ? and from_acc = ?",[tokendata.id,id],async (e,r)=>{res.json({success:true});});
    }
    else if (action == 'cancel'){
        connection.query("DELETE FROM Friend_Requests where to_acc = ? and from_acc = ?",[id,tokendata.id],async (e,r)=>{res.json({success:true});});
    }
    else{
        res.json({success:false});
    }
});


// get Account conversations
App.post('/conversation/get', async (req, res) => {
    const { body } = req;
    const { token } = body;

    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    connection.query("select Conversation.image,Conversation.name,Conversation.type,Conversation.id,'' as acc_id  FROM Conversation,Conversation_Participent where Conversation_Participent.participent = ? and Conversation.id = Conversation_Participent.conversation",[tokendata.id],async (e,r)=>{
        let direct_list = [];
        let query = '';
        for (let i in r){
            if(r[i].type == 'direct'){
                direct_list.push(r[i].id);
                query += '?,';
            }
        }
        if(direct_list.length){
            connection.query(`select Accounts.id,Accounts.image,Accounts.lname,Accounts.fname,Conversation_Participent.conversation from Accounts,Conversation_Participent where Accounts.id = Conversation_Participent.participent and Conversation_Participent.participent <> ? and Conversation_Participent.conversation in (${query.slice(0,-1)})`,[tokendata.id,...direct_list],(err,result)=>{
                for (let i in r){
                    for (let y in result){
                        if(r[i].id == result[y].conversation){
                            r[i].name = result[y].lname + ' ' + result[y].fname;
                            r[i].image = result[y].image;
                            r[i].acc_id = result[y].id;
                        }
                    }
                }
                return res.json({success:true,msg:r});

            });
        }
        else{
            return res.json({success:true,msg:r});
        }
    });
});

// get Account conversations
App.post('/conversation/info', async (req, res) => {
    const { body } = req;
    const { token,id } = body;
    
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    connection.query("select Conversation.image,Conversation.name,Conversation.type,Conversation.id,Conversation_Participent.role FROM Conversation,Conversation_Participent where Conversation_Participent.participent = ? and Conversation.id = Conversation_Participent.conversation and Conversation.id = ?",[tokendata.id,id],async (e,r)=>{
        if (!r.length){
            return res.json({success: false,msg:{}});
        }
        connection.query(`select Accounts.id,Accounts.image,Accounts.lname,Accounts.fname,Conversation_Participent.role from Accounts,Conversation_Participent where Accounts.id = Conversation_Participent.participent and Conversation_Participent.conversation = ?`,[id],(err,result)=>{
            r[0].participents = result;
            return res.json({success:true,msg:r[0]});

        });
    });
});
// get non conversation participent friends
App.post('/conversation/friends', async (req, res) => {
    const { body } = req;
    const { token,id } = body;
    
    const tokendata  = jwt.verify(token,PRIVATE_KEY);

    connection.query("select f1,f2 FROM Friends where f1 = ? or f2 = ?",[tokendata.id,tokendata.id],async (e,r)=>{
        
        let friends_id = r.map(e=>Object.values(e).filter((e)=>e != tokendata.id)[0]);
        connection.query(`select * FROM Accounts where id in (${friends_id.join(',')})`,[],async (e,result)=>{
            connection.query("select participent FROM Conversation_Participent where conversation = ?",[id],async (e,r)=>{
                let participents_id = r.map((e)=>Object.values(e)[0]);
                friends_id = friends_id.filter((e)=>!participents_id.includes(e));
                return res.json({success:true,msg:result.filter((e)=>friends_id.includes(e.id))});
            });
        });
    });
});


// add conversations participent
App.post('/conversation/add', async (req, res) => {
    const { body } = req;
    const { token,id,members } = body;
    
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    const membersdata = JSON.parse(members);
    let insertData = [];
    membersdata.forEach(e=>insertData.push(...[id,e]));

    let query = '';
    membersdata.forEach((e)=>query+=`(NULL,?,?,'member',CURRENT_TIMESTAMP),`);
    connection.query(`INSERT INTO Conversation_Participent values ${query.slice(0,-1)}`,insertData,async (e,r)=>{
        return res.json({success:true});
    });
});

// delete conversations participent
App.post('/conversation/delete', async (req, res) => {
    const { body } = req;
    const { token,id,member_id } = body;
    
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    
    connection.query(`select * from Conversation_Participent where participent = ? and conversation = ?`,[tokendata.id,id],async (e,r)=>{
        if(!r[0] || r[0].role !== 'owner'){
            return res.json({'success':false});
        }
        connection.query(`DELETE FROM Conversation_Participent  where participent = ? and conversation = ?`,[member_id,id],async (e,r)=>{
            return res.json({success:true});
        });

    });
});

// quit group participent
App.post('/group/quit', async (req, res) => {
    const { body } = req;
    const { token,id } = body;
    
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    connection.query(`DELETE FROM Conversation_Participent where conversation = ? and participent = ?`,[id,tokendata.id],async (e,r)=>{
        return res.json({success:true});
    });

});

// delete group participent
App.post('/group/delete', async (req, res) => {
    const { body } = req;
    const { token,id } = body;
    
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    
    connection.query(`select * from Conversation_Participent where participent = ? and conversation = ?`,[tokendata.id,id],async (e,r)=>{
        if(!r[0] || r[0].role !== 'owner'){
            return res.json({'success':false});
        }
        connection.query(`DELETE FROM Conversation_Participent where conversation = ?`,[id],async (e,r)=>{
            connection.query(`DELETE FROM Conversation where id = ?`,[id],async (e,r)=>{
                return res.json({success:true});
            });
        });

    });
});


// get conversation messages
App.post('/messages/get', async (req, res) => {
    const { body } = req;
    const { token,id } = body;
    
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    connection.query("select Conversation_Participent.id,Conversation_Participent.participent,Accounts.lname,Accounts.fname FROM Conversation_Participent,Accounts where Conversation_Participent.conversation = ? and Accounts.id = Conversation_Participent.participent",[id],async (e,r)=>{
        let query = "select * FROM Conversation_Message where Autor = ?";
        let participents_id = {};
        for (let i in r){
            query += " or Autor = ?";
            participents_id[r[i].id] = r[i].participent;
        }
        if (!Object.values(participents_id).includes(tokendata.id)){
            return res.json({success:false});
        }
        
        connection.query(query.slice(0,-13),Object.keys(participents_id).map((e)=>Number(e)),async (err,result)=>{
            for (let i in result){
                result[i]['you'] = false;
                result[i]['date'] = moment(result[i].creation_date).format('hh:mm A');
                for (let y in r){
                    if (r[y].id == result[i].Autor){
                        result[i]['lname'] = r[y]['lname'];
                        result[i]['fname'] = r[y]['fname'];
                    }
                }
                if(participents_id[result[i].Autor] == tokendata.id){
                    result[i]['you'] = true;
                }
            }
            return res.json({success:true,msg:result});
        });
    });
});
// send message
App.post('/messages/send',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,id,content,type } = body;
    
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    connection.query("select id,participent FROM Conversation_Participent where conversation = ?",[id],async (e,r)=>{
        let participents_id = {};
        for (let i in r){
            participents_id[r[i].participent] = r[i].id;
        }
        if (!Object.keys(participents_id).includes(`${tokendata.id}`)){
            return res.json({success:false});
        }
        if (type == 'text'){
            connection.query("Insert into Conversation_Message values (Null,?,?,?,CURRENT_TIMESTAMP)",[type,content,participents_id[tokendata.id]],async (err,result)=>{
                expressWS.getWss().clients.forEach((webs)=>{
                    webs.send(JSON.stringify({"type":"refresh","data":id}));
                })
                return res.json({success:true});

            });
        }
        else if (type == 'image'){
            const imgId = await uploadFile(files[0]);
            await drive.permissions.create({
                fileId:imgId.id,
                requestBody:{
                    role:"reader",
                    type:"anyone"
                }
            }).then(()=>{
                return
            })
            const image = await drive.files.get({
                fileId:imgId.id,
                fields:'webContentLink'
            }).then((res)=>{
                return res.data
            });
            // .replace('download','view')
            connection.query("Insert into Conversation_Message values (Null,?,?,?,CURRENT_TIMESTAMP)",[type,image.webContentLink.replace('download','view'),participents_id[tokendata.id]],async (err,result)=>{
                expressWS.getWss().clients.forEach((webs)=>{
                    webs.send(JSON.stringify({"type":"refresh","data":id}));
                })
                return res.json({success:true});

            });
        }
        else{
            
            return res.json({success:false});
        }
    });
});
// create groupe
App.post('/group/create',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token, name, members } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);

    let image = {webContentLink:'https://drive.google.com/file/d/1oo8tFuplo_nMJSShgsDqGYP3WWu2xDEo/view?usp=view'};
    if(files[0]){
        const imgId = await uploadFile(files[0]);
        console.log('nn')
        await drive.permissions.create({
            fileId:imgId.id,
            requestBody:{
                role:"reader",
                type:"anyone"
            }
        }).then(()=>{
            return
        })
        image = await drive.files.get({
            fileId:imgId.id,
            fields:'webContentLink'
        }).then((res)=>{
            return res.data
        });
        console.log(image);
    }

    connection.query("insert into Conversation values (NULL,?,?,'group',CURRENT_TIMESTAMP)",[name,image.webContentLink.replace('download','view')],(err,result)=>{
        connection.query(`insert into Conversation_Participent values (NULL,${result.insertId},?,'owner',CURRENT_TIMESTAMP)${`,(NULL,${result.insertId},?,'member',CURRENT_TIMESTAMP)`.repeat(JSON.parse(members).length)}`,[tokendata.id,...JSON.parse(members)],(err,result)=>{
            res.json({success:true});
        });
    });
});
// get profile info 
App.post('/profile/get',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    connection.query("SELECT username,lname,fname,email,image,theme,language from Accounts where id = ?",[tokendata.id],(err,result)=>{
        res.json({success:true,msg:result});
    });
});
// edit profile info 
App.post('/profile/edit',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,account } = body;
    const accountData = JSON.parse(account);
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    const Account  = await new Promise((resolve,reject)=>{
        connection.query('SELECT * FROM Accounts where id = ?',[tokendata.id],((e,r)=>{
            if(e){
                return reject(e);
            }
            resolve(r[0]);
        })) 
    });

    const AccountSameEmail  = await new Promise((resolve,reject)=>{
        connection.query('SELECT * FROM Accounts where email = ? and id <> ?',[accountData.email,tokendata.id],((e,r)=>{
            if(e){
                return reject(e);
            }
            resolve(r);
        })) 
    });
    if(AccountSameEmail.length){
        return res.json({success:false,msg:"Email already in use"});
    }
    else if (accountData.old_pass && accountData.old_pass !== Account.password){
        return res.json({success:false,msg:"Password is Wrong"});
    }
    else if(accountData.new_pass){
        Account.password = accountData.new_pass;
    }
    
    connection.query(`UPDATE Accounts set lname = ?,fname = ?,email = ?,password = ?,theme = ?,language = ? where id = ?`,[accountData.lname,accountData.fname,accountData.email,Account.password,accountData.theme,accountData.language,tokendata.id],(err,result)=>{
        res.json({success:true});
    });
});

// bug report
App.post('/profile/edit/image',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,old_image } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    const old_imageId = /id=.*&/.exec(old_image)[0].slice(3,-1);
    try{
        await deleteFile(old_imageId);

    }
    catch(err){
    }
    let image = {webContentLink:''};
    if(files[0]){
        const imgId = await uploadFile(files[0]);
        await drive.permissions.create({
            fileId:imgId.id,
            requestBody:{
                role:"reader",
                type:"anyone"
            }
        }).then(()=>{
            return
        })
        image = await drive.files.get({
            fileId:imgId.id,
            fields:'webContentLink'
        }).then((res)=>{
            return res.data
        });
    }
    connection.query(`UPDATE Accounts set image = ? where id = ?`,[image.webContentLink.replace('download','view'),tokendata.id],(err,result)=>{
        res.json({success:true});
    });
});

// bug report
App.post('/report',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,message } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    
    connection.query(`INSERT INTO Bug_Report values (NULL,?,?,CURRENT_TIMESTAMP)`,[message,tokendata.id],(err,result)=>{
        res.json({success:true});
    });
});


// bug report
App.post('/report',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,message } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    
    connection.query(`INSERT INTO Bug_Report values (NULL,?,?,CURRENT_TIMESTAMP)`,[message,tokendata.id],(err,result)=>{
        res.json({success:true});
    });
});

// get community data
App.post('/communities', async (req, res) => {
    const { body } = req;
    const { token,id } = body;

    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    connection.query("select Communities.*,Accounts.username from Communities,Accounts where Communities.id = ? and Communities.owner = Accounts.id",[id],async (e,r)=>{
        const community = r[0];
        community.grant = false;
        if (community.owner == tokendata.id){
            community.grant = true;
        }
        connection.query(`
            select Community_Post.*,Accounts.lname,Accounts.fname,Accounts.image,Accounts.username
            from Community_Post,Accounts
            where Community_Post.community = ?
            and Community_Post.writer = Accounts.id
            group by Community_Post.id 
        `,[id],async (e,r)=>{
            connection.query("select * from Community_Vote where communities = ? and voter = ?",[id,tokendata.id],async (e,result)=>{
                let postsIds = result.map(el=>el.community_post);
                community.posts = r.map((element)=>{
                    element.voted = postsIds.includes(element.id);
                    return element;
                })
                return res.json({success:true,msg:community});
            });
        });
    });
});

// get communities
App.post('/communities/get',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    

    connection.query(`Select communities from Community_Favorite where account = ?`,[tokendata.id],(err,r)=>{
        connection.query(`Select * from Communities`,[],(err,result)=>{
            res.json({success:true,msg:result.map((e)=>{e.favorite =  r.map(el=>Object.values(el)[0]).includes(e.id);return e})});
        });
    });
});

// add community
App.post('/communities/add',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,title,color } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    if (!files[0]){
        return res.json({'success':false});
    }
    const imgId = await uploadFile(files[0]);
    await drive.permissions.create({
        fileId:imgId.id,
        requestBody:{
            role:"reader",
            type:"anyone"
        }
    }).then(()=>{
        return
    })
    const image = await drive.files.get({
        fileId:imgId.id,
        fields:'webContentLink'
    }).then((res)=>{
        return res.data
    });

    connection.query(`INSERT INTO Communities values (NULL,?,?,?,?,CURRENT_TIMESTAMP)`,[title,image.webContentLink.replace('download','view'),color,tokendata.id],(err,result)=>{
        
        res.json({success:true});
    });
});
// add post
App.post('/post',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,text,type,id } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    let image = {webContentLink:''};
    if(files[0]){
        const imgId = await uploadFile(files[0]);
        await drive.permissions.create({
            fileId:imgId.id,
            requestBody:{
                role:"reader",
                type:"anyone"
            }
        }).then(()=>{
            return
        })
        image = await drive.files.get({
            fileId:imgId.id,
            fields:'webContentLink'
        }).then((res)=>{
            return res.data
        });
    }
    
    connection.query(`INSERT INTO Community_Post values (NULL,?,?,?,0,?,?,CURRENT_TIMESTAMP)`,[text,type,image.webContentLink.replace('download','view'),id,tokendata.id],(err,result)=>{
        
        res.json({success:true});
    });
});

// add favorite
App.post('/favorite/add',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,id } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    
    connection.query(`SELECT * From Community_Favorite where account = ? and communities = ?`,[tokendata.id,id],(err,r)=>{
        if (r.length){
            connection.query(`DELETE From Community_Favorite where account = ? and communities = ?`,[tokendata.id,id],(err,result)=>{
                res.json({success:true});
            });
            return;
        }
        connection.query(`INSERT INTO Community_Favorite values (?,?)`,[id,tokendata.id],(err,result)=>{
            res.json({success:true});
        });
    });
});
// add vote
App.post('/post/vote',upload.any(), async (req, res) => {
    const { body,files } = req;
    const { token,id,idcom } = body;
    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    
    connection.query(`SELECT * From Community_Vote where voter = ? and community_post = ?`,[tokendata.id,id],(err,r)=>{
        if (r.length){
            connection.query(`DELETE From Community_Vote where voter = ? and community_post = ?`,[tokendata.id,id],(err,result)=>{
                connection.query(`Update Community_Post set votes = votes - 1 where id = ?`,[id],(err,result)=>{
                    res.json({success:true});
                });
            });
            return;
        }
        connection.query(`INSERT INTO Community_Vote values (?,?,?)`,[id,idcom,tokendata.id],(err,result)=>{
            connection.query(`Update Community_Post set votes = votes + 1 where id = ?`,[id],(err,result)=>{
                res.json({success:true});
            });
        });
    });
});



App.ws('/messages',(ws,res)=>{
    
    ws.send(JSON.stringify({"type":"connected"}));
});


App.listen(PORT,()=>console.log(`server on port ${PORT}`));