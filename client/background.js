const serverUrl = ""
const streamsName = ["fefegg","colas_bim","deotoons","kennystream"];
let popupPort;
let streamInfo = new Map();

class StreamInfo{
    constructor(data,name){
        this.streamTitle = data.streamTitle;
        this.streamGame = data.streamGame;
        this.streamOn = data.live;
        this.streamUrl = data.streamUrl;
        this.streamName = name;
    }

    send(popupPort){
        popupPort.postMessage({streamName : this.streamName, title: this.streamTitle, game: this.streamGame, live: this.streamOn, url : this.streamUrl});
    }

    update(data){
        this.streamTitle = data.streamTitle;
        this.streamGame = data.streamGame;
        this.streamOn = data.live;
        this.streamUrl = data.streamUrl;
    }
}

async function liveOn(streamName){
    const timer = ms => new Promise(res => setTimeout(res, ms));

    function setIcon(path){
        chrome.action.setIcon({
            path: path
        });
    }
    
    for(let i=0;i<12;i++){

        if(i%2==0){
            setTimeout(function () {
                setIcon("/images/streamIcon/"+streamName+".png");
            },250);
        }else{
            setTimeout(function () {
                setIcon("/images/icon/128_icon.png");
            },250);
        }

        await timer(250);
    }

    setIcon("/images/icon/128_icon.png")
}

function createAndSendSubscription(){
    // Use the PushManager to get the user's subscription to the push service.
    registration.pushManager.getSubscription().then(async function (subscription) {
        // If a subscription was found, return it.
        if (subscription) {
            return subscription;
        }

        // Get the server's public key
        const response = await fetch(serverUrl+'/vapidPublicKey');
        const vapidPublicKey = await response.text();

        // Otherwise, subscribe the user (userVisibleOnly allows to specify that we don't plan to
        // send notifications that don't have a visible effect for the user).
        return registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidPublicKey
        });
    }).then(async function(subscription) {
        //Envoie de la subscrition au server
        if(subscription){
            let payload = [];

            for(let streamName of streamsName){
                payload.push({
                    subscription : subscription,
                    streamName : streamName,
                    subjects : ["streamOn","streamOff"]
                });
            }

            const response = await fetch(serverUrl+'/subscribe', {
                method: "POST",
                body: JSON.stringify(payload),
                headers: {
                    "content-type": "application/json"
                }
            });

            if(response){
                response.json().then( value => {
                    for(let resp of value){

                        let data = JSON.parse(resp);

                        if(streamInfo.has(data.name)){
                            streamInfo.delete(data.name);
                        }

                        streamInfo.set(data.name,new StreamInfo(data.data,data.name));

                        if(popupPort)
                            streamInfo.get(data.name).send(popupPort);
                    }
                });

                
            }
        }
    });
}

chrome.runtime.onConnect.addListener(function (port) {
    popupPort = port;

    for(let sInfo of streamInfo.values()){
        sInfo.send(popupPort);
    }

    popupPort.onDisconnect.addListener(() => {
        popupPort = undefined;
    })
})

chrome.runtime.onMessage.addListener(function (msg){

    if(msg == "refresh"){
        createAndSendSubscription();
    }
})

self.onnotificationclick = function(event) {
    chrome.tabs.create({
        url: event.notification.data
    });
}

// Register event listener for the 'push' event.
self.onpush = function (event) {
    // Retrieve the textual payload from event.data (a PushMessageData object).
    // Other formats are supported (ArrayBuffer, Blob, JSON), check out the documentation
    // on https://developer.mozilla.org/en-US/docs/Web/API/PushMessageData.
    const payload = event.data ? JSON.parse(event.data.text()) : null;

    let titre = "";
    if(payload.type == "streamOn"){
        titre = "[LIVE ON] " +payload.name +" passe en live!";
        liveOn(payload.name);
    }

    if(payload.type == "streamOff"){
        titre = "[LIVE OFF] Fin du live.";
    }

    if(payload.type == "streamInfo"){
        titre = "Une update sur le live!";
    }

    if(streamInfo.has(payload.name))
        streamInfo.get(payload.name).update(payload.data);
    else
        streamInfo.set(payload.name,new StreamInfo(payload.data,payload.name));

    if(popupPort)
        streamInfo.get(payload.name).send(popupPort);

    event.waitUntil(
        self.registration.showNotification(titre,{
          body: "[" + payload.data.streamGame + "]"+ payload.data.streamTitle,
          icon: "images/streamIcon/"+payload.name+".png",
          tag: payload.type,
          data : payload.data.streamUrl,
          timestamp : payload.time
        })
    );
}

createAndSendSubscription();