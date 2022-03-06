const crypto = require("crypto");
const request = require('request');

require('dotenv').config()

class SubscriptionPush {
    constructor(data, subjects) {
      this.data = data;
      this.subjects = subjects; 
    }
};

class StreamerData {
    constructor(name,subjects) {
        this.name = name;
        this.id = "";
        this.isLive = false;
        this.streamTitle = "";
        this.streamGame = "";
        this.lastUrl = "";
        this.subjects = subjects;
        this.subscriptions = new Map();
    }

    setDataOnline(statusData) {
        this.isLive = true;
        this.streamTitle = statusData.title;
        this.streamGame = statusData.game_name;
        this.lastUrl = "https://www.twitch.tv/"+this.name;
    }

    setDataOffline(statusData) {
        this.isLive = false;
        this.streamTitle = statusData.title;
        this.streamGame = statusData.description;
        this.lastUrl = statusData.url;
    }

    setData(statusData) {
        this.streamTitle = statusData.title;
        this.streamGame = statusData.game_name;
    }

    getDataNotif(type){    
        return JSON.stringify({
            "type": type,
            "name": this.name,
            "data": {
                live: this.isLive,
                streamTitle: this.streamTitle,
                streamGame: this.streamGame,
                streamUrl: this.lastUrl
            },
            "time":Date.now()
        });
    }
};

let streamsToCheck = new Map();
let streamApplications = new Map();

function verifyTwitchSignature(req, res, buf, encoding) {
    const messageId = req.header("Twitch-Eventsub-Message-Id");
    const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
    const messageSignature = req.header("Twitch-Eventsub-Message-Signature");
    const time = Math.floor(new Date().getTime() / 1000);

    if (Math.abs(time - timestamp) > 600) {
        // needs to be < 10 minutes
        console.log(
            `Verification Failed: timestamp > 10 minutes. Message Id: ${messageId}.`
        );
        throw new Error("Ignore this request.");
    }

    if (!process.env.SECRET_KEY) {
        console.log(`Twitch signing secret is empty.`);
        throw new Error("Twitch signing secret is empty.");
    }

    const computedSignature =
        "sha256=" +
        crypto
            .createHmac("sha256", process.env.SECRET_KEY)
            .update(messageId + timestamp + buf)
            .digest("hex");

    if (messageSignature !== computedSignature) {
        throw new Error("Invalid signature.");
    }
};

class StreamApplication {
    constructor(_clientId,_clientSecret,_twitchCallback,_secretKey) {
        this.clientId = _clientId;
        this.clientSecret = _clientSecret;
        this.twitchCallback = _twitchCallback;
        this.subscriptionsId = new Map();
        this.accessToken = "";
    }

    subscribeStreamOnline(streamId) {
        const options = {
            url: process.env.SUBSCRIBE,
            json: true,
            headers: {
                'Client-Id': this.clientId,
                'Authorization': 'Bearer ' + this.accessToken,
            },
            body: {
                "type": "stream.online",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": streamId,
                },
                "transport": {
                    "method": "webhook",
                    "callback": this.twitchCallback + "/online",
                    "secret": process.env.SECRET_KEY,
                }
            }
        }
    
        return new Promise((resolve,reject) => {
            request.post(options, function (error, response, body) {
                if (!error && !body.error) {
                    if(body.data[0]){
                        this.subscriptionsId.set("stream.online",body.data[0].id);
                        console.log("SubscribeOnline valider " + this.clientId);
                        resolve(true);
                    }
                } else{
                    reject("SubscribeOnline : "+body.error);
                }
                    
            }.bind(this))
        });
    }
    
    subscribeStreamOffline(streamId) {
        const options = {
            url: process.env.SUBSCRIBE,
            json: true,
            headers: {
                'Client-Id': this.clientId,
                'Authorization': 'Bearer ' + this.accessToken,
            },
            body: {
                "type": "stream.offline",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": streamId,
                },
                "transport": {
                    "method": "webhook",
                    "callback": this.twitchCallback + "/offline",
                    "secret": process.env.SECRET_KEY,
                }
            }
        }
    
        return new Promise((resolve,reject) => {
            request.post(options, function (error, response, body) {
                if (!error && !body.error) {
                    if(body.data[0]){
                        this.subscriptionsId.set("stream.offline",body.data[0].id);
                        console.log("SubscribeOffline valider " + this.clientId);
                        resolve(true);
                    }
                } else{
                    reject("SubscribeOffline : "+body.error)
                }
            }.bind(this))
        });
    }
    
    subscribeStreamInfo(streamId) {
        const options = {
            url: process.env.SUBSCRIBE,
            json: true,
            headers: {
                'Client-Id': this.clientId,
                'Authorization': 'Bearer ' + this.accessToken,
            },
            body: {
                "type": "channel.update",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": streamId,
                },
                "transport": {
                    "method": "webhook",
                    "callback": this.twitchCallback + "/info", 
                    "secret": process.env.SECRET_KEY,
                }
            }
        }
    
        return new Promise((resolve,reject) => {
            request.post(options, function (error, response, body) {
                if (!error && !body.error) {
                    if(body.data[0]){
                        this.subscriptionsId.set("channel.update",body.data[0].id);
                        console.log("SubscribeInfo valider " + this.clientId);
                        resolve(true);
                    }
                } else{
                    reject("SubscribeInfo : "+body.error);
                }
            }.bind(this))
        });
    }
    
    unsubscribe(event){
        const options = {
            url: process.env.SUBSCRIBE+`?id=${this.subscriptionsId.get(event)}`,
            headers: {
                'Client-Id': this.clientId,
                'Authorization': 'Bearer ' + this.accessToken,
            }
        }
        
        return new Promise(resolve => {
            request.delete(options, function (error, response, body) {
                this.subscriptionsId.delete(event);
                resolve(true);
            }.bind(this));
        });
    }

    getAccesToken() {
        const options = {
            url: process.env.GET_TOKEN,
            json: true,
            body: {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: "client_credentials"
            }
        }
        return new Promise((resolve,reject) => {
            request.post(options, function (error, response, body) {
                if (!error) {
                    resolve(body.access_token);
                }else{
                    reject("GetToken : " + error);
                }
            })
        });
    }

    getLastVideo(streamId) {
        const options = {
            url: process.env.GET_STREAM_VIDEO + `?user_id=${streamId}&type=archive&first=1`,
            method: "GET",
            headers: {
                'Client-Id': this.clientId,
                'Authorization': 'Bearer ' + this.accessToken,
            }
        }
    
        return new Promise((resolve,reject) => {
            request.get(options, function (error, response, body) {
                if (!error) {
                    let jsonData = JSON.parse(body);
                    resolve(jsonData.data);
                }else{
                    reject("GetLastVideo : " + error);
                }
            })
        })
    }
    
    getStatus(streamId) {
        /*
            {
                "data": [
                    {
                        "id": "43426312188",
                        "user_id": "121652526",
                        "user_login": "littlebigwhale",
                        "user_name": "LittleBigWhale",
                        "game_id": "509658",
                        "game_name": "Just Chatting",
                        "type": "live",
                        "title": "Back home !",
                        "viewer_count": 2138,
                        "started_at": "2021-10-02T19:15:22Z",
                        "language": "fr",
                        "thumbnail_url": "https://static-cdn.jtvnw.net/previews-ttv/live_user_littlebigwhale-{width}x{height}.jpg",
                        "tag_ids": [
                            "6f655045-9989-4ef7-8f85-1edcec42d648"
                        ],
                        "is_mature": false
                    }
                ],
                "pagination": {}
            }
        */
        const options = {
            url: process.env.GET_STREAM_DATA + `?user_id=${streamId}`,
            method: "GET",
            headers: {
                'Client-Id': this.clientId,
                'Authorization': 'Bearer ' + this.accessToken,
            }
        }
    
        return new Promise((resolve,reject) => {
            request.get(options, function (error, response, body) {
                if (!error) {
                    let jsonData = JSON.parse(body);
                    resolve(jsonData.data);
                }else{
                    reject("GetStatus : " + error);
                }
            })
        });
    }
    
    getStreamerId(streamName) {
        /*
        {"data": [
            {
            "id": "141981764",
            "login": "twitchdev",
            "display_name": "TwitchDev",
            "type": "",
            "broadcaster_type": "partner",
            "description": "Supporting third-party developers building Twitch integrations from chatbots to game integrations.",
            "profile_image_url": "https://static-cdn.jtvnw.net/jtv_user_pictures/8a6381c7-d0c0-4576-b179-38bd5ce1d6af-profile_image-300x300.png",
            "offline_image_url": "https://static-cdn.jtvnw.net/jtv_user_pictures/3f13ab61-ec78-4fe6-8481-8682cb3b0ac2-channel_offline_image-1920x1080.png",
            "view_count": 5980557,
            "email": "not-real@email.com",
            "created_at": "2016-12-14T20:32:28Z"
            }]
        }
        */
    
        const options = {
            url: process.env.GET_USER_DATA + `?login=${streamName}`,
            method: "GET",
            headers: {
                'Client-Id': this.clientId,
                'Authorization': 'Bearer ' + this.accessToken,
            }
        }
    
        return new Promise((resolve,reject) => {
            request.get(options, function (error, response, body) {
                if (!error) {
                    let jsonData = JSON.parse(body);
                    resolve(jsonData.data[0].id);
                }else{
                    reject("GetStreamerId : " + error);
                }
            })
        })
    
    }

    getSubscriptionIds(){
        const options = {
            url: process.env.SUBSCRIBE,
            json: true,
            headers: {
                'Client-Id': this.clientId,
                'Authorization': 'Bearer ' + this.accessToken,
            }
        }

        return new Promise((resolve,reject) => {
            request.get(options, function (error, response, body) {
                if (!error && !body.error) {

                    for(let i=0;i<body.data.length;++i){
                        let data = body.data[i];
                        this.subscriptionsId.set(data.type,data.id);
                    }
                    resolve(true);
                } else{
                    reject("GetSubscription : "+body.error);
                }
                    
            }.bind(this))
        });
    }
}

function clearSubscription(clientId,accessToken){
    const options = {
        url: process.env.SUBSCRIBE,
        json: true,
        headers: {
            'Client-Id': clientId,
            'Authorization': 'Bearer ' + accessToken,
        }
    }
 
    return new Promise((resolve) => {
        request.get(options, async function (error, response, body) {            
            if (!error && !body.error) {
                for(let i=0;i<body.data.length;++i){
                    let data = body.data[i];

                    const optionsDelete = {
                        url: process.env.SUBSCRIBE+`?id=${data.id}`,
                        headers: {
                            'Client-Id': clientId,
                            'Authorization': 'Bearer ' + accessToken,
                        }
                    }
                    console.log("Delete Subscriptions : "+data.type +" id : " + data.id);

                    await new Promise((resolve) => {
                        request.delete(optionsDelete, function (error, response, body) {resolve(true)});
                    });
                }
                resolve(true);
            }
        });
    });
}

function getStreamApplication(streamId){
    for(let pair of streamsToCheck){
        if(pair[1].id == streamId)
            return streamApplications[pair[0]];
    }
}

async function exitHandler(options, exitCode) {
    if (options.cleanup){
        for(let streamApplication of streamApplications.values()){
            await clearSubscription(streamApplication.clientId,streamApplication.accessToken);
        }
    }
    if (exitCode || exitCode === 0) console.log(exitCode);
    if (options.exit) process.exit();
}

module.exports.exitHandler = exitHandler;
module.exports.getStreamApplication = getStreamApplication;
module.exports.verifyTwitchSignature = verifyTwitchSignature;
module.exports.clearSubscription = clearSubscription;

module.exports.streamApplications = streamApplications;
module.exports.streamsToCheck = streamsToCheck;
module.exports.StreamApplication = StreamApplication;
module.exports.StreamerData = StreamerData;
module.exports.SubscriptionPush = SubscriptionPush;