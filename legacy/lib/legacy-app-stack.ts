import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { SubnetType } from '@aws-cdk/aws-ec2';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as targets from '@aws-cdk/aws-elasticloadbalancingv2-targets';

interface LegacyAppStackProps extends cdk.StackProps {
  vpc: ec2.Vpc,
  albSecurityGroup: ec2.SecurityGroup,
  appSecurityGroup: ec2.SecurityGroup
}

export class LegacyAppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: LegacyAppStackProps) {
    super(scope, id, props);
    const vpc = props.vpc;

    const amznLinux = ec2.MachineImage.latestAmazonLinux({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      edition: ec2.AmazonLinuxEdition.STANDARD,
      virtualization: ec2.AmazonLinuxVirt.HVM,
      storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    const instanceType = ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO);
    
    const appServer1 = this.createInstance(vpc, amznLinux, instanceType, props.appSecurityGroup, 'appServer1');

    const alb = new elbv2.ApplicationLoadBalancer(this, 'alb', {
      vpc,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: vpc.selectSubnets({subnetType: SubnetType.PUBLIC}),
      internetFacing: true
    });

    const albListener = alb.addListener('Listener', {
      port: 80,
    });

    albListener.addTargets('Target', {
      port: 8080,
      targets: [
        new targets.InstanceTarget(appServer1)
      ]
    });
    new cdk.CfnOutput(this, 'loadBalancerDnsName', { value: alb.loadBalancerDnsName });
  }

  private createInstance = (vpc:ec2.Vpc, machineImage: ec2.IMachineImage, instanceType: ec2.InstanceType, securityGroup:ec2.SecurityGroup, instanceName:string) => {
    return new ec2.Instance(this, instanceName, {
      vpc,
      instanceType: instanceType,
      machineImage: machineImage,
      vpcSubnets: vpc.selectSubnets( {subnetType: SubnetType.PUBLIC} ),
      securityGroup: securityGroup,
      keyName: 'dna-serverless-hol-keypair',
      userData: ec2.UserData.custom(`
        #!/bin/bash
        yum update -y
        yum install -y java-1.8.0-openjdk-devel
        mkdir -p /root/spring-petclinic && cd /root/spring-petclinic
        wget -O spring-petclinic-custom.jar https://raw.githubusercontent.com/skipio11/dna-serverless-hol/master/legacy/sample-app/spring-petclinic-custom-2.4.2.jar
        java -jar spring-petclinic-custom.jar &
      `)
    });
  }
}
