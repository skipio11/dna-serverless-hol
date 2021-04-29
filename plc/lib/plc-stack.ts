import * as cdk from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as sqs from '@aws-cdk/aws-sqs';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as apigateway from '@aws-cdk/aws-apigateway';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaEventSources from '@aws-cdk/aws-lambda-event-sources';
import * as cr from '@aws-cdk/custom-resources';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as events from '@aws-cdk/aws-events';
import * as eventsTargets from '@aws-cdk/aws-events-targets';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as cloudwatchActions from "@aws-cdk/aws-cloudwatch-actions";
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';

export class PlcStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /* Legacy Endpoint */
    const legacyEndpoint = this.node.tryGetContext('legacyEndpoint');

    /* DynamoDB Table */
    const tokensTable = new dynamodb.Table(this, 'tokens', {
      partitionKey: {
        name: 'tokenId',
        type: dynamodb.AttributeType.STRING
      },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY  // This is for test environmnet
      
    });
    
    tokensTable.addGlobalSecondaryIndex({
      indexName: "tokens-gsi01",
      partitionKey: {
          name: 'tokenStatus',
          type: dynamodb.AttributeType.STRING
      },
      sortKey: {
          name: 'createTime',
          type: dynamodb.AttributeType.NUMBER
      },
    });
    
    const statusTable = new dynamodb.Table(this, 'status', {
      partitionKey: {
        name: 'statusId',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY  // This is for test environmnet
    });
    
    /* SQS */
    const tokenCheckQueue = new sqs.Queue(this, 'tokenCheckQueue');
    const tokenCleanQueue = new sqs.Queue(this, 'tokenCleanQueue');
    
    /* LambdaRole */
    const lambdaRole = new iam.Role(this, "lambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );
    
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'cloudwatch:PutMetricData'] // TODO : 변경
    }));
    tokensTable.grantReadWriteData(lambdaRole);
    statusTable.grantReadWriteData(lambdaRole);
    tokenCheckQueue.grantSendMessages(lambdaRole);
    tokenCheckQueue.grantConsumeMessages(lambdaRole);
    tokenCleanQueue.grantSendMessages(lambdaRole);
    tokenCleanQueue.grantConsumeMessages(lambdaRole);
    
    /* Lambda@Edge */
    const edgeRequestFilterLambda = new lambda.Function(this, "edgeRequestFilterLambda", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "edge-request-filter.handler",
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    const edgeResponseFilterLambda = new lambda.Function(this, "edgeResponseFilterLambda", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "edge-response-filter.handler",
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });
    
    /* Static Web Contents */
    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket');
    
    const staticWebBucket = new s3.Bucket(this, 'staticWebBucket', {
      websiteIndexDocument: 'index.html',
      serverAccessLogsBucket: accessLogsBucket
    });
    
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('./src/static-web')],
      destinationBucket: staticWebBucket
    });

    /* API G/W, Lambda */
    const tokenHeartbeatUpdater = new lambda.Function(this, "tokenHeartbeatUpdater", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "token-heartbeat-updater.handler",
      environment: {
        TOKENS_TABLE_NAME: tokensTable.tableName
      },
      tracing: lambda.Tracing.ACTIVE,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512
    });
    
    const runtimeApi = new apigateway.RestApi(this, "runtimeApi", {
      deployOptions: {
          stageName: "default",
          metricsEnabled: true,
          loggingLevel: apigateway.MethodLoggingLevel.INFO,
          dataTraceEnabled: true,
          tracingEnabled: true
        },
    });
    const apiEndPointUrlWithoutProtocol = cdk.Fn.select(1, cdk.Fn.split("://", runtimeApi.url));
    const apiEndPointDomainName = cdk.Fn.select(0, cdk.Fn.split("/", apiEndPointUrlWithoutProtocol));
    
    const heartbeatResource = runtimeApi.root.addResource("waiting").addResource("api").addResource("tokens").addResource("{tokenId}").addResource("heartbeat");
    heartbeatResource.addMethod("POST", new apigateway.LambdaIntegration(tokenHeartbeatUpdater, {}));
    
    /* CloudFront */
    const oia = new cloudfront.OriginAccessIdentity(this, 'OIA');
    staticWebBucket.grantRead(oia);
    
    const cloudfrontDistribution = new cloudfront.CloudFrontWebDistribution(this, 'cloudfrontDistribution', {
      originConfigs: [
        {
          customOriginSource: {
            domainName: legacyEndpoint,
            originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            originHeaders: {
              "tokens-table-name": tokensTable.tableName,
              "status-table-name": statusTable.tableName,
              "deployment-region": this.region,
            }
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
              forwardedValues: {
                cookies: {
                  forward: 'all'
                },
                queryString: true
              },
              lambdaFunctionAssociations: [
                {
                  eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
                  lambdaFunction: edgeRequestFilterLambda.currentVersion
                },
                {
                  eventType: cloudfront.LambdaEdgeEventType.ORIGIN_RESPONSE,
                  lambdaFunction: edgeResponseFilterLambda.currentVersion
                }
              ]
            }
          ],
        },
        {
          s3OriginSource: {
            s3BucketSource: staticWebBucket,
            originAccessIdentity: oia
          },
          behaviors: [
            {
              isDefaultBehavior: false,
              allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
              forwardedValues: {
                cookies: {
                  forward: 'all'
                },
                queryString: true
              },
              pathPattern: 'waiting/static/*',
            }
          ],
        },
        {
          customOriginSource: {
            domainName: apiEndPointDomainName,
            originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          },
          behaviors: [
            {
              isDefaultBehavior: false,
              allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
              forwardedValues: {
                cookies: {
                  forward: 'all'
                },
                queryString: true
              },
              pathPattern: 'default/waiting/api/*',
            }
          ],
          
        },
      ],
      defaultRootObject: ''
    });
    
    new cdk.CfnOutput(this, 'cloudfrontPublicDnsName', { value: cloudfrontDistribution.domainName });
    
    /* DynamoDB Streams, SQS, Lambda */
    const tokenCreateListenerLambda = new lambda.Function(this, "tokenCreateListenerLambda", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "token-create-listener.handler",
      environment: {
        TOKEN_CHECK_SQS_URL: tokenCheckQueue.queueUrl,
      },
      tracing: lambda.Tracing.ACTIVE,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
    });

    tokenCreateListenerLambda.addEventSource(new lambdaEventSources.DynamoEventSource(tokensTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 100,
      maxBatchingWindow: cdk.Duration.seconds(1),
    }));
    
    const tokenHeartbeatChecker = new lambda.Function(this, "tokenHeartbeatChecker", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "token-heartbeat-checker.handler",
      environment: {
        TOKENS_TABLE_NAME: tokensTable.tableName,
        TOKEN_CHECK_SQS_URL: tokenCheckQueue.queueUrl,
        TOKEN_CLEAN_SQS_URL: tokenCleanQueue.queueUrl,
      },
      tracing: lambda.Tracing.ACTIVE,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
    });

    tokenHeartbeatChecker.addEventSource(new lambdaEventSources.SqsEventSource(tokenCheckQueue, {
      batchSize: 100,
      maxBatchingWindow: cdk.Duration.seconds(1),
    }));
    
    const tokenCleanListenerLambda = new lambda.Function(this, "tokenCleanListenerLambda", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "token-clean-listener.handler",
      environment: {
        TOKENS_TABLE_NAME: tokensTable.tableName,
        STATUS_TABLE_NAME: statusTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
    });

    tokenCleanListenerLambda.addEventSource(new lambdaEventSources.SqsEventSource(tokenCleanQueue, {
      batchSize: 100,
      maxBatchingWindow: cdk.Duration.seconds(1),
    }));

    /* Status */
    const statusInitializerLambda = new lambda.Function(this, "statusInitializerLambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "status-initializer.handler",
      environment: {
        STATUS_TABLE_NAME: statusTable.tableName,
        MAX_IN_USE_COUNT: '100',
      },
      tracing: lambda.Tracing.ACTIVE,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    const statusInitializeProvider = new cr.Provider(this, 'statusInitializeProvider', {
      onEventHandler: statusInitializerLambda,
    });

    new cdk.CustomResource(this, 'initStatusResource', { serviceToken: statusInitializeProvider.serviceToken });

    const statusUpdaterLambda = new lambda.Function(this, "statusUpdaterLambda", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "status-updater.handler",
      environment: {
        STATUS_TABLE_NAME: statusTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(120),
      memorySize: 1024,
    });

    statusUpdaterLambda.addEventSource(new lambdaEventSources.DynamoEventSource(tokensTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 100,
      maxBatchingWindow: cdk.Duration.seconds(1),
    }));
    
    // Monitoring
    const metricGeneratorLambda = new lambda.Function(this, "metricGeneratorLambda", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("src/lambda"),
      handler: "metric-generator.handler",
      environment: {
        STATUS_TABLE_NAME: statusTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });
    

    const sfnConfigureCount = new sfn.Pass(this, 'sfnConfigureCount', {
      result: sfn.Result.fromObject({
        "index": 0,
        "count": 6,
        "step": 1
      }),
      resultPath: '$.iterator'
    });

    const sfnMetricGeneratorTask = new tasks.LambdaInvoke(this, 'sfnMetricGeneratorTask', {
      lambdaFunction: metricGeneratorLambda,
      payloadResponseOnly: true,
      resultPath: '$.iterator'
    });

    const sfnWait = new sfn.Wait(this, 'sfnWait', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(10)),
    })
      .next(sfnMetricGeneratorTask)
    ;
    
    const sfnDone = new sfn.Pass(this, 'Done');

    const sfnDefinition = sfnConfigureCount
      .next(sfnMetricGeneratorTask)
      .next(new sfn.Choice(this, 'IsCountReached')
        .when(sfn.Condition.booleanEquals('$.iterator.continue', true), sfnWait)
        .otherwise(sfnDone)
    );

    const sfnMachine = new sfn.StateMachine(this, 'StateMachine', {
      definition: sfnDefinition
    });

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.expression('rate(1 minute)')
    });

    rule.addTarget(new eventsTargets.SfnStateMachine(sfnMachine));

    const waitingMetric = new cloudwatch.Metric({
      namespace: 'plc',
      metricName: 'Waiting',
      dimensions: { domain: 'default' }
    });

    const waitingAlarm = waitingMetric.createAlarm(this, 'WaitingAlarm', {
      period: cdk.Duration.minutes(1),
      threshold: 100,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
    });

    const plcSnsTopic = new sns.Topic(this, 'plcSnsTopic');
    plcSnsTopic.addSubscription(new subscriptions.EmailSubscription(this.node.tryGetContext('adminEmail')));

    waitingAlarm.addAlarmAction(new cloudwatchActions.SnsAction(plcSnsTopic));
  }
}
