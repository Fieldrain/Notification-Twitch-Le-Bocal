const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const objectHash = require('object-hash');
const twitch = require('./twitch.js');
const CronJob = require('cron').CronJob;

require('dotenv').config()
const app = express();

webpush.setVapidDetails('mailto:'+process.env.MAIL,process.env.PUBLIC_KEY,process.env.PRIVATE_KEY);

async function initServer(){

    // creation des applications twitch pour chaque streamer
    twitch.streamApplications.set("fefegg",new twitch.StreamApplication(process.env.CLIENT_ID_FEFE,process.env.CLIENT_SECRET_FEFE,process.env.TWITCH_CALLBACK,process.env.SECRET_KEY_FEFE));
    twitch.streamApplications.set("colas_bim",new twitch.StreamApplication(process.env.CLIENT_ID_COLAS,process.env.CLIENT_SECRET_COLAS,process.env.TWITCH_CALLBACK,process.env.SECRET_KEY_COLAS));
    twitch.streamApplications.set("deotoons",new twitch.StreamApplication(process.env.CLIENT_ID_DEOTOONS,process.env.CLIENT_SECRET_DEOTOONS,process.env.TWITCH_CALLBACK,process.env.SECRET_KEY_DEOTOONS));
    twitch.streamApplications.set("kennystream",new twitch.StreamApplication(process.env.CLIENT_ID_KENNY,process.env.CLIENT_SECRET_KENNY,process.env.TWITCH_CALLBACK,process.env.SECRET_KEY_KENNY));

    // creation des streamerdata
    twitch.streamsToCheck.set("fefegg",new twitch.StreamerData("fefegg",["streamOn","streamOff"]));
    twitch.streamsToCheck.set("colas_bim",new twitch.StreamerData("colas_bim",["streamOn","streamOff"]));
    twitch.streamsToCheck.set("deotoons",new twitch.StreamerData("deotoons",["streamOn","streamOff"]));
    twitch.streamsToCheck.set("kennystream",new twitch.StreamerData("kennystream",["streamOn","streamOff"]));

    // recuperation des infos des streamerdata
    for(let pair of twitch.streamsToCheck){
        let streamApplication = twitch.streamApplications.get(pair[0]);
        let streamData = pair[1];

        streamApplication.accessToken = await streamApplication.getAccesToken().catch(error => console.log(error));

        await twitch.clearSubscription(streamApplication.clientId,streamApplication.accessToken);

        let response = await streamApplication.getStreamerId(streamData.name).catch(error => console.log(error));
        if(response){
            streamData.id = response;
            response = await streamApplication.getStatus(streamData.id).catch(error => console.log(error));

            if(response.length > 0){
                //le stream est on
                streamData.setDataOnline(response[0]);
            }else{
                //le stream est off
                response = await streamApplication.getLastVideo(streamData.id).catch(error => console.log(error));
                if(response.length > 0){
                    streamData.setDataOffline(response[0]);
                }
            }

            // on subscrit au eventsub de twitch
            streamApplication.getSubscriptionIds();
            if(!streamApplication.subscriptionsId.has("stream.online"))
                await streamApplication.subscribeStreamOnline(streamData.id).catch(error => console.log(error));
            if(!streamApplication.subscriptionsId.has("stream.offline"))
                await streamApplication.subscribeStreamOffline(streamData.id).catch(error => console.log(error));
            if(!streamApplication.subscriptionsId.has("channel.update"))
                await streamApplication.subscribeStreamInfo(streamData.id).catch(error => console.log(error));
        }
    }
}

async function regenAccesToken(){
    for(let pair of twitch.streamApplications){
        pair[1].accessToken = await pair[1].getAccesToken().catch(error => console.log(error));
    }
}

function send(streamName, payload, subjects) {
    for(let pair of twitch.streamsToCheck){
        if(streamName == "all" || pair[0] == streamName){
            let streamData = pair[1];

            for(let hash of streamData.subscriptions.keys()){
                let subscriptionPush = streamData.subscriptions.get(hash);

                // parcours la liste des sujets 
                for(let subject of subjects){

                    //cherche si le sujet est dans la liste du stream
                    if(subscriptionPush.subjects.find(function (element) {return element == subject;})){

                        //envoie la notification push et supprime la subscription si elle est expiré
                        webpush.sendNotification(subscriptionPush.data, payload).catch(err=> streamData.subscriptions.delete(hash));
                    }
                }
            }
        }
    }
}

let timeOutInfo = null;

const job = new CronJob('0 0 0 1 * *', regenAccesToken);

const port = 3000;
app.listen(port, ()=>{
    initServer();

    job.start();

    console.log("Server Started");
});

const path = "/extensionTwitch";
//const path = "";

app.use(path+'/online',express.json({ verify: twitch.verifyTwitchSignature }));
app.use(path+'/offline',express.json({ verify: twitch.verifyTwitchSignature }));
app.use(path+'/info',express.json({ verify: twitch.verifyTwitchSignature }));

app.use(path+'/vapidPublicKey',cors());
app.use(path+'/subscribe',cors(),express.json());
app.use(path+'/unsubscribe',cors(),express.json());

// Route lié a twitch
app.post(path+"/offline", async (req, res) => {
    if(req.body){
        if (req.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
            res.send(req.body.challenge) // Returning a 200 status with the received challenge to complete webhook creation flow
        } else if (req.header("Twitch-Eventsub-Message-Type") === "notification") {
            let streamName = req.body.event.broadcaster_user_login;
            let streamData = twitch.streamsToCheck.get(streamName);

            if(streamData){
                let streamApplication = twitch.streamApplications.get(streamName);

                let response = await streamApplication.getLastVideo(streamData.id).catch(error => console.log(error));
                if(response.length > 0){
                    streamData.setDataOffline(response[0]);
                }

                send(streamName, streamData.getDataNotif("streamOff"),["streamOff"]);

                res.status(200).send("") // Default .send is a 200 status
            }else{
                res.status(404).send("") // Streamer non trouver
            }
        }else if(req.header("Twitch-Eventsub-Message-Type") === "revocation"){
            let streamId = req.body.subscription.condition.broadcaster_user_id;
            await twitch.getStreamApplication(streamId).subscribeStreamOffline(streamId).catch(error => console.log(error));
        }
    }
});

app.post(path+"/online", async (req, res) => {
    if(req.body){
        if (req.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
            res.send(req.body.challenge) // Returning a 200 status with the received challenge to complete webhook creation flow
        } else if (req.header("Twitch-Eventsub-Message-Type") === "notification") {
            let streamName = req.body.event.broadcaster_user_login;
            let streamData = twitch.streamsToCheck.get(streamName);

            if(streamData){
                let streamApplication = twitch.streamApplications.get(streamName);

                let response = await streamApplication.getStatus(streamData.id).catch(error => console.log(error));
                if(response.length > 0){
                    streamData.setDataOnline(response[0]);
                }

                send(streamName, streamData.getDataNotif("streamOn"),["streamOn"]);

                res.status(200).send("") // Default .send is a 200 status
            }else{
                res.status(404).send("") // Streamer non trouver
            }
        }else if(req.header("Twitch-Eventsub-Message-Type") === "revocation"){
            let streamId = req.body.subscription.condition.broadcaster_user_id;
            await twitch.getStreamApplication(streamId).subscribeStreamOnline(streamId).catch(error => console.log(error));
        }
    }
});

app.post(path+"/info", async (req, res) => {
    if(req.body){
        if (req.header("Twitch-Eventsub-Message-Type") === "webhook_callback_verification") {
            res.send(req.body.challenge) // Returning a 200 status with the received challenge to complete webhook creation flow
        } else if (req.header("Twitch-Eventsub-Message-Type") === "notification") {
            let streamName = req.body.event.broadcaster_user_login;
            let streamData = twitch.streamsToCheck.get(streamName);

            if(streamData && streamData.isLive){
                
                let data = {
                    title : req.body.event.title,
                    game_name : req.body.event.category_name
                };

                streamData.setData(data);

                if(!timeOutInfo){
                    timeOutInfo = setTimeout(function(){
                        send(streamName, streamData.getDataNotif("streamInfo"),["streamInfo"]);
                        timeOutInfo = null;
                    }.bind(this),180000);
                }

                res.status(200).send("") // Default .send is a 200 status
            }else{
                res.status(404).send("") // Streamer non trouver
            }
        }else if(req.header("Twitch-Eventsub-Message-Type") === "revocation"){
            let streamId = req.body.subscription.condition.broadcaster_user_id;
            await twitch.getStreamApplication(streamId).subscribeStreamInfo(streamId).catch(error => console.log(error));
        }
    }
});

// Route lié a l'extension
app.get(path+'/vapidPublicKey', async (req, res)=>{
    res.send(process.env.PUBLIC_KEY);
})

app.post(path+'/subscribe', async (req, res)=>{
    //get push subscription object
    let statusCode = 201;

    let payload = [];
    for(let data of req.body){
        const subscription = data.subscription;
        const subjects = data.subjects;
        const streamName = data.streamName;

        const hash = objectHash.MD5(subscription);

        let streamData = twitch.streamsToCheck.get(streamName);

        if(!streamData.subscriptions.has(hash)){
            streamData.subscriptions.set(hash,new twitch.SubscriptionPush(subscription,subjects));
        }else{
            statusCode = 202;
        }

        payload.push(streamData.getDataNotif("init"));
    }

    //send status 201
    res.status(statusCode).json(payload);
})

app.post(path+'/unsubscribe', async (req, res)=>{
    //get push subscription object

    for(let data of req.body){
        const subscription = data.subscription;
        const subjects = data.subjects;
        const streamName = data.streamName;

        const hash = objectHash.MD5(subscription);

        let streamData = twitch.streamsToCheck.get(streamName);

        let subscriptionPush = streamData.subscriptions.get(hash);

        var filtered = subscriptionPush.subjects.filter(function(value, index, arr){ 
            return subjects.find( subject => subject == value);
        });

        if(filtered.length > 0){
            streamData.subscriptions.set(hash,new twitch.SubscriptionPush(subscription,filtered));
        }else{
            streamData.subscriptions.delete(hash);
        }
    }

    //send status 201
    res.status(201).json({})
})

process.stdin.resume();//so the program will not close instantly

//do something when app is closing
process.on('exit', twitch.exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', twitch.exitHandler.bind(null, {cleanup:true,exit:true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', twitch.exitHandler.bind(null, {cleanup:true,exit:true}));
process.on('SIGUSR2', twitch.exitHandler.bind(null, {cleanup:true,exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', twitch.exitHandler.bind(null, {cleanup:true,exit:true}));