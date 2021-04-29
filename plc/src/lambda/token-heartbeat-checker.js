var AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
var sqs = new AWS.SQS();
const tokenCheckSqsUrl = process.env.TOKEN_CHECK_SQS_URL;
const tokenCleanSqsUrl = process.env.TOKEN_CLEAN_SQS_URL;
const tokensTableName = process.env.TOKENS_TABLE_NAME;

const sendCheckQueue = function(tokenId){
    var params = {
      DelaySeconds: 10,
      MessageBody: JSON.stringify({'tokenId' : tokenId}),
      QueueUrl: tokenCheckSqsUrl
    };
    
    return sqs.sendMessage(params).promise();
}

const sendDeleteQueue = function(tokenId, tokenStatus){
    var params = {
      MessageBody: JSON.stringify(
        {
            tokenId: tokenId,
            tokenStatus: tokenStatus
        }
      ),
      QueueUrl: tokenCleanSqsUrl
    };
    
    return sqs.sendMessage(params).promise();
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

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    const expiredTime = Date.now() - 1000 * 20;

    for (const record of event.Records) {
        const body = JSON.parse(record.body);
        const tokenId = body.tokenId;

        let token = await selectToken(tokenId);
        
        console.log(token);
        if(!token.Item){
            console.log("Token not exist : " + body.tokenId);
            continue;
        }
        let tokenItem = token.Item;

        console.log("heartbeatTime :" + tokenItem.heartbeatTime);
        console.log("expiredTime :" + expiredTime);

        if(tokenItem.heartbeatTime < expiredTime){
            console.log("sendDeleteQueue token: " + tokenId);
            await sendDeleteQueue(tokenId, tokenItem.tokenStatus);
        }
        else{
            console.log("sendCheckQueue token: " + tokenId)
            await sendCheckQueue(tokenId);
        }
    }

    console.log(`Successfully processed ${event.Records.length} records.`);
    return `Successfully processed ${event.Records.length} records.`;
};