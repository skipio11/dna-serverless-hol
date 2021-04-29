const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const statusTableName = process.env.STATUS_TABLE_NAME;

async function updateThrottleStatus(statusId, inUseCount, waitingCount){
    const params = {
        TableName: statusTableName,
        Key: {
          statusId: statusId
        },
        UpdateExpression: "SET inUseCount = inUseCount + :inUseCount, "
                            + "waitingCount = waitingCount + :waitingCount ",
        ConditionExpression: "attribute_exists(statusId)",
        ExpressionAttributeValues: {
          ":inUseCount": inUseCount,
          ":waitingCount": waitingCount
        },
        ReturnValues: "ALL_NEW"
    };
    
    return dynamoDb.update(params).promise();
}

async function updateWaitEnabledStatus(statusId, waitEnabled){
    const params = {
        TableName: statusTableName,
        Key: {
          statusId: statusId
        },
        UpdateExpression: "SET waitEnabled = :waitEnabled",
        //ConditionExpression: "attribute_exists(statusId)",
        ExpressionAttributeValues: {
          ":waitEnabled": waitEnabled
        },
        ReturnValues: "ALL_NEW"
    };
    
    return dynamoDb.update(params).promise();
}

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    let inUseCount = 0;
    let waitingCount = 0;
    
    for (const record of event.Records) {
        console.log(record.eventID);
        console.log(record.eventName);
        console.log('DynamoDB Record: %j', record.dynamodb);
        switch(record.eventName){
            case 'REMOVE':
                if(record.dynamodb.OldImage.tokenStatus.S == "InUse"){
                    inUseCount--;
                }
                if(record.dynamodb.OldImage.tokenStatus.S == "Waiting"){
                    waitingCount--;
                }
                break;
            case 'INSERT':
                if(record.dynamodb.NewImage.tokenStatus.S == "InUse"){
                    inUseCount++;
                }
                if(record.dynamodb.NewImage.tokenStatus.S == "Waiting"){
                    waitingCount++;
                }
                break;
            case 'MODIFY':
                if(record.dynamodb.OldImage.tokenStatus.S == "Waiting" && record.dynamodb.NewImage.tokenStatus.S == "InUse"){
                    inUseCount++;
                    waitingCount--;
                }
                break;
        }
        console.log("inUseCount: " + inUseCount + " / " + "waitingCount: " + waitingCount);
    }
    
    const statusData = await updateThrottleStatus("default", inUseCount, waitingCount);
    
    console.log(JSON.stringify(statusData));
    if(statusData.Attributes.maxInUseCount * 0.5 > statusData.Attributes.inUseCount){
        updateWaitEnabledStatus("default", false);
    }
    else{
        updateWaitEnabledStatus("default", true);
    }

    return `Successfully processed ${event.Records.length} records.`;
};
