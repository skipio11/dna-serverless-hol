const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const statusTableName = process.env.STATUS_TABLE_NAME;
const maxInUseCount = Number(process.env.MAX_IN_USE_COUNT);

async function insertStatus(statusId, inUseCount, waitingCount, maxInUseCount, waitEnabled){
    const params = {
        TableName: statusTableName,
        Item: {
          statusId: statusId,
          inUseCount: inUseCount,
          waitingCount: waitingCount,
          maxInUseCount: maxInUseCount,
          waitEnabled: waitEnabled
        }
    };
    
    return dynamoDb.put(params).promise();
}

exports.handler = async (event) => {
    console.log(event);
    if(event.RequestType != 'Create'){
        return 'pass'
    }
    await insertStatus('default', 0, 0, maxInUseCount, false);

    return `init`;
};
