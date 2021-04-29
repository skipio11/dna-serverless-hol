
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const response = event.Records[0].cf.response;

    request.headers.cookie = request.headers.cookie || [];
    let cookie = request.headers.cookie.pop();
    
    try{
        if(cookie){
            let setCookie = response.headers["set-cookie"] = response.headers["set-cookie"] || [];
            setCookie.push({"key": "Set-Cookie", "value": cookie.value+"; Path=/" || ""});
        }
    }
    catch(e){
        console.log(e);
    }
    
    return response;
};
