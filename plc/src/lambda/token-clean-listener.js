var AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tokensTableName = process.env.TOKENS_TABLE_NAME;
const statusTableName = process.env.STATUS_TABLE_NAME;

async function selectStatus(statusId){
    const params = {
        TableName: statusTableName,
        Key: {
          statusId: statusId
        }
    };
    
    return dynamoDb.get(params).promise();
}

async function updateTokenStatus(tokenId, tokenStatus){
    let admissionTime = Date.now();

    const params = {
        TableName: tokensTableName,
        Key: {
          tokenId: tokenId
        },
        UpdateExpression: "SET tokenStatus = :tokenStatus, "
                          +"admissionTime = :admissionTime ",
        ConditionExpression: "attribute_exists(tokenId)",
        ExpressionAttributeValues: {
          ":tokenStatus": tokenStatus,
          ":admissionTime": admissionTime
        },
        ReturnValues: "ALL_NEW"
    };
    
    return dynamoDb.update(params).promise();
}

async function getOldestWaitingTokens(limitCount){
    const params = {
        TableName: tokensTableName,
        IndexName: "tokens-gsi01",
        KeyConditionExpression: "tokenStatus = :tokenStatus",
        ExpressionAttributeValues: {
            ":tokenStatus": "Waiting"
        },
        Limit: limitCount
    };
    
    return dynamoDb.query(params).promise();
}

async function deleteToken(tokenId) {
    let params = {
        TableName: tokensTableName,
        Key: {
            "tokenId": tokenId
        }
    };

    return dynamoDb.delete(params).promise();
}

exports.handler = async (event) => {
    const inUseTokenItems = [];
    for (const record of event.Records) {
        const body = JSON.parse(record.body);
        const tokenId = body.tokenId;
        const tokenStatus = body.tokenStatus;
        if(tokenStatus == 'Waiting'){
            await deleteToken(tokenId);
        }
        else{
            inUseTokenItems.push(body);
        }
    }

    let limitCount = inUseTokenItems.length;
    console.log('inUseTokenItems: ' + JSON.stringify(inUseTokenItems));

    const statusData = await selectStatus('default');

    let leftCount = statusData.Item.maxInUseCount - statusData.Item.inUseCount;
    if(limitCount < leftCount){
        limitCount = leftCount;
    }
    
    console.log(`${limitCount} / ${statusData.Item.maxInUseCount} / ${statusData.Item.inUseCount}`);

    const waitingTokens = await getOldestWaitingTokens(limitCount);
    const waitingTokenItems = waitingTokens.Items;
    console.log(waitingTokens);

    for (const token of waitingTokenItems) {
        console.log('waitingToken: ' + JSON.stringify(token));
        await updateTokenStatus(token.tokenId, 'InUse');
    }
    
    for (const token of inUseTokenItems) {
        console.log('inUseToken: ' + JSON.stringify(token));
        await deleteToken(token.tokenId);
    }
    console.log(`Successfully processed ${event.Records.length} records.`);
    return `Successfully processed ${event.Records.length} records.`;
};