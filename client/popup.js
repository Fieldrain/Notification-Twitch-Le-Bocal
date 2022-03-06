var port = chrome.runtime.connect({
    name: "Sample Communication"
});

port.onMessage.addListener(function(msg) {
    const streamTitle = document.getElementById("stream-title_"+msg.streamName);
    const streamGame = document.getElementById("stream-game_"+msg.streamName);
    const streamProfile = document.getElementById("stream-profile_"+msg.streamName);
    const streamProfileMain = document.getElementById("stream-profile_main_"+msg.streamName);
    const streamUrl = document.getElementById("stream-url_"+msg.streamName);
    const streamUrlMain = document.getElementById("stream-url_main_"+msg.streamName);

    if(!msg.game || msg.game.length === 0 )
        msg.game = "Replay";

    streamTitle.innerHTML = msg.title;
    streamGame.innerHTML = msg.game;
    streamUrl.href = msg.url;
    streamUrlMain.href = msg.url;

    streamUrl.title = "["+msg.game+"] "+msg.title;
    streamUrlMain.title = "["+msg.game+"] "+msg.title;

    if(msg.live){
        streamProfile.classList.add("card__on");
        streamProfileMain.classList.add("card__on");
    }else{
        streamProfile.classList.remove("card__on");
        streamProfileMain.classList.remove("card__on");
    }

});

const refreshButton = document.getElementById("refresh");

function activate () {
    refreshButton.disabled = false;
}

refreshButton.onclick = function(event){
    refreshButton.disabled = true;
    setTimeout(activate,60000*5);

    chrome.runtime.sendMessage("refresh");
};