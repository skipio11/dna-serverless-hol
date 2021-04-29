const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tokensTableName = process.env.TOKENS_TABLE_NAME;

async function updateHeartbeat(tokenId){
    const currentTime = Date.now();
    
    const params = {
        TableName: tokensTableName,
        Key: {
          tokenId: tokenId
        },
        UpdateExpression: "SET heartbeatTime = :currentTime",
        ConditionExpression: "attribute_exists(tokenId)",
        ExpressionAttributeValues: {
          ":currentTime": currentTime
        },
        ReturnValues: "ALL_NEW"
    };
    
    return dynamoDb.update(params).promise();
}

exports.handler = async (event) => {
    try{
        const data = await updateHeartbeat(event.pathParameters.tokenId);
        const result = {
            "tokenId": event.pathParameters.tokenId,
            "tokenStatus": data.Attributes.tokenStatus
        };

        const response = {
            statusCode: 200,
            headers: {"Access-Control-Allow-Origin": "*"},
            body: JSON.stringify(result),
        };
        return response;
    }
    catch(e){
        const result = {
            "tokenId": event.pathParameters.tokenId,
            "tokenStatus": ''
        };

        const response = {
            statusCode: 404,
            headers: {"Access-Control-Allow-Origin": "*"},
            body: JSON.stringify(result),
        };
        return response;
    }
};