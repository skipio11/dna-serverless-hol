const AWS = require("aws-sdk");
const uuid = require('uuid');
let dynamoDb;
let tokensTableName;
let statusTableName;

function getCookieValue(headers, cookieName){
    console.log(headers.cookie);

    if(!headers.cookie){
        return null;
    }
    
    try{
        for (let i = 0; i < headers.cookie.length; i++) {
            let cookies = headers.cookie[i].value.split(";");
            let values = cookies.filter(element => {
                return element.trim().startsWith(cookieName+"=");
            });
            
            console.log("values : " + values);
            
            if(values){
                return values[0].split("=")[1];
            }
        }
    }
    catch(e){
        return null;
    }
}

async function selectStatus(statusId){
    const params = {
        TableName: statusTableName,
        Key: {
          statusId: statusId
        }
    };
    
    return dynamoDb.get(params).promise();
}

async function selectToken(tokenId) {
    let params = {
        TableName: tokensTableName,
        Key: {
            "tokenId": tokenId
        }
    };

    return dynamoDb.get(params).promise();
}

async function insertToken(tokenId, tokenStatus){
    let currentTime = Date.now();
    let admissionTime = tokenStatus == "InUse" ? currentTime : 0;
    console.log("tokenId : " + tokenId);
    console.log("currentTime : " + currentTime);
    
    const params = {
        TableName: tokensTableName,
        Item: {
          tokenId: tokenId,
          createTime: currentTime,
          admissionTime: admissionTime,
          heartbeatTime: currentTime,
          tokenStatus: tokenStatus
        }
    };
    
    return dynamoDb.put(params).promise();
}

exports.handler = async (event) => {
    console.log(JSON.stringify(event));
    const request = event.Records[0].cf.request;
    
    const distributionDomainName = event.Records[0].cf.config.distributionDomainName;
    tokensTableName = request.origin.custom.customHeaders["tokens-table-name"][0].value;
    statusTableName = request.origin.custom.customHeaders["status-table-name"][0].value;
    const deploymentRegion = request.origin.custom.customHeaders["deployment-region"][0].value;
    
    console.log("distributionDomainName: " + distributionDomainName);
    console.log("tokensTableName: " + tokensTableName);
    console.log("statusTableName: " + statusTableName);
    console.log("deploymentRegion: " + deploymentRegion);
    
    if(!dynamoDb){
        AWS.config.update({region: deploymentRegion});
        dynamoDb = new AWS.DynamoDB.DocumentClient();        
    }
    
    const serviceUrl = "http://" + distributionDomainName + "/";

    let tokenId = getCookieValue(request.headers, "tokenId");
    let tokenStatus;
    
    if(tokenId){
        let tokenData = await selectToken(tokenId);
        if(tokenData.Item){
            tokenStatus = tokenData.Item.tokenStatus;
        }
    }
    
    if(!tokenStatus){
        const statusData = await selectStatus("default");

        if(statusData.Item.waitEnabled){
            tokenStatus = 'Waiting';
        }
        else{
            tokenStatus = 'InUse';
        }
        tokenId = uuid.v4();
        await insertToken(tokenId, tokenStatus);
    }
    
    if(tokenStatus == "InUse"){
        request.headers.cookie = request.headers.cookie || [];
        request.headers.cookie.push({ key: 'Cookie', value: 'tokenId='+tokenId });
        return request;
    }
    
    const response = {
        status: '302',
        statusDescription: 'Moved Temporarily',
        headers: {
          'location': [{
            key: 'Location',
            value: '/waiting/static/index.html?tokenId='+ tokenId + "&serviceUrl="+serviceUrl,
          }],
          'set-cookie': [ {
                key: 'Set-Cookie',
                value: 'tokenId='+tokenId +"; Path=/"
          }],
          'cache-control': [ {
                key: 'cache-control',
                value: 'no-cache, no-store, must-revalidate'
          }],    
        },
    };

    return response;
};