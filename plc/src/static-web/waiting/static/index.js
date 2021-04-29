function getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
        c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
        }
    }
    return "";
}

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function sendHeartbeat(callback) {
    var tokenId = getCookie("tokenId");
    
    if(tokenId == ""){
        console.error("tokenId is undefined.");
        return;
    }

    var stage = "default";
    var targetUrl = "/" + stage + "/waiting/api/tokens/"+tokenId+"/heartbeat";
    xhr = new XMLHttpRequest();

    xhr.open('POST', targetUrl);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onload = callback
    xhr.send();
}

var callback = function(){
    console.log("try to send heatbeat for token : " + getCookie("tokenId"));
}

if("undefined" != typeof heatbeatCallback){
    callback = heatbeatCallback;
}
setInterval(function(){
    sendHeartbeat(callback);
}, 5000);