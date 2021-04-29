const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const cloudwatch = new AWS.CloudWatch();
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

function getMetricData(metricName, currentDate, statusCount){
  return {
          MetricName: metricName,
          Dimensions: [
            {
              Name: 'domain',
              Value: 'default'
            }
          ],
          Timestamp: currentDate,
          Unit: 'Count',
          Value: statusCount
  };
}

exports.handler = async (event) => {
    console.log(JSON.stringify(event));
    const statusData = await selectStatus('default');
    const currentDate = new Date();

    const metric = {
      MetricData : [],
      Namespace: 'plc'
    };
    
    metric.MetricData.push(getMetricData('InUse', currentDate, statusData.Item.inUseCount));
    metric.MetricData.push(getMetricData('Waiting', currentDate, statusData.Item.waitingCount));
    metric.MetricData.push(getMetricData('MaxInUse', currentDate, statusData.Item.maxInUseCount));
    console.log(JSON.stringify(metric));
    
    await cloudwatch.putMetricData(metric).promise();
    
    if(event.iterator){
      let index = event.iterator.index;
      let step = event.iterator.step;
      let count = event.iterator.count;
      
      index += step;
      
      const response = {
          index: index,
          step: step,
          count: count,
          continue: index < count
      };
      
      return response;
    }
    else{
      return 'success';
    }
};
