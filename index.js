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
const fs = require('fs');

dotenv.config();

const App = express();
const upload = multer({
    limits: { fieldSize: 25 * 1024 * 1024 }
});

const {
    PRIVATE_KEY,
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    REFRESH_TOKEN
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
    bufferStream.end(fileObject.buffer);
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


const connection = mysql.createConnection(process.env.DATABASE_URL);



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
        console.log(result[0].image)
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

        console.log(result)
        connection.query("insert into Accounts_recovery values (Null,?,?,false,CURRENT_TIMESTAMP)",[result[0].email,code],(err,result)=>{
            // console.log(err,result)
            return res.json({'success':true});
        })
    });
});

// verify recovery code
App.post('/validate', (req,res)=>{
    const email = req.body.email;
    const code = req.body.code;
    connection.query("select *,CURRENT_TIMESTAMP from Accounts_recovery where email = ? and used = 0 order by id desc",[email],async (err,result)=>{
        console.log();
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
            console.log(res);
            return res.data
        });
        connection.query("insert into Accounts values (Null,?,?,?,?,?,?,?,?,NULL,CURRENT_TIMESTAMP)",[Account.username,Account.first_name,Account.last_name,Account.email,Account.password,Account.image.webContentLink.replace('download','view'),'ENG','Dark'],(err,result)=>{
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

    // console.log(tokendata);
    console.log(tokendata.id);
    connection.query("select id,image,username,email,fname,lname from Accounts where id <> ?",[tokendata.id],async (e,r)=>{
        connection.query('select * from Friends where f1 = ? or f2 = ?',[tokendata.id,tokendata.id],(err,result)=>{
            for (let i in r){
                r[i]['isfriend'] = false;
            }
            for (let i in r){
                r[i].image = r[i].image.replace('download','view') 
                for (let y in result){
                    if ([result[y].f1,result[y].f2].includes(r[i].id)){
                        r[i]['isfriend'] = true;
                    }

                }
            }
            res.json({success:true,msg:r});
        })
    });
});

// delete friend
App.post('/friends/delete', async (req, res) => {
    const { body } = req;
    const { token, id } = body;

    const tokendata  = jwt.verify(token,PRIVATE_KEY);


    connection.query("DELETE from Friends where (f1 = ? or f2 = ?) and (f1 = ? or f2 = ?)",[tokendata.id,tokendata.id,id,id],async (e,r)=>{
        res.json({success:true});
    });
});
// request friend
App.post('/friends/request', async (req, res) => {
    const { body } = req;
    const { token, id } = body;

    const tokendata  = jwt.verify(token,PRIVATE_KEY);
    

    connection.query("insert into Friend_Requests values (?, ?,CURRENT_TIMESTAMP)",[tokendata.id,id],async (e,r)=>{
        console.log(e)
        res.json({success:true});
    });
});



App.listen(PORT,()=>console.log(`server on port ${PORT}`));