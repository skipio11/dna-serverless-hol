var AWS = require('aws-sdk');
var sqs = new AWS.SQS();
const tokenCheckSqsUrl = process.env.TOKEN_CHECK_SQS_URL;

const sendMessage = function(tokenId){
    var params = {
      DelaySeconds: 10,
      MessageBody: JSON.stringify({'tokenId' : tokenId}),
      QueueUrl: tokenCheckSqsUrl
    };
    
    return sqs.sendMessage(params).promise();
}

exports.handler = async (event) => {
    //console.log('Received event:', JSON.stringify(event, null, 2));
    
    let count = 0;
    for (const record of event.Records) {
        if(!record.dynamodb.OldImage){
            const tokenId = record.dynamodb.NewImage.tokenId.S;
            await sendMessage(tokenId);
            console.log('DynamoDB Record: %j', record.dynamodb);
            count++;
        }
    }
    return `Successfully processed ${count} records.`;
};