const express = require('express');
const bodyparser = require('body-parser');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const moment = require('moment');

dotenv.config();

const App = express();


function getFullDate(){
    return moment.utc().toISOString(); 
}

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
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const PORT = 4055;

App.use(bodyparser.urlencoded({extended:0}));
App.use(bodyparser.json());


App.get('/', (req,res)=>{
    connection.query("select * from Accounts",(err,result)=>{
        if (err){
            res.status(403).json({'success':false,'msg':err});
            return
        }
        res.json({'success':true,'msg':result});
    });
});
// create account
JSON.stringify

// login to account
App.post('/login', (req,res)=>{
    const email    = req.body.email;
    const password = req.body.password;
    connection.query("select * from Accounts where email = ? and password = ?",[email,password],(err,result)=>{
        if (err){
            return res.status(403).json({'success':false,'msg':err});
        }
        if (!result.length){
            return res.status(403).json({'success':false,'msg':"Wrong Credentials"});
        }
        const token = jwt.sign({email,password},PRIVATE_KEY, { expiresIn: 60 * 60 * 24 * 30 });
        TOKEN_LOG[getFullDate()] ? TOKEN_LOG[getFullDate()].push(token) : TOKEN_LOG[getFullDate()] = [token];
        res.json({'success':true,'msg':{token}});
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



App.listen(PORT,()=>console.log(`server on port ${PORT}`));