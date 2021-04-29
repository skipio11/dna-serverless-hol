import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export class JmeterStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const vpc = new ec2.Vpc(this, 'Jmeter-VPC');
    const jmeterSg = new ec2.SecurityGroup(this, 'Jmeter-SG', {
      vpc,
      description: '',
      allowAllOutbound: true
    });

    jmeterSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3389), 'Allow RDP from Any');

    const windowsImage = ec2.MachineImage.latestWindows(
      ec2.WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE
    );

    const instanceType = ec2.InstanceType.of(ec2.InstanceClass.C5, ec2.InstanceSize.XLARGE);
    const jmeterServer = this.createInstance(vpc, windowsImage, instanceType, jmeterSg, 'jmeterServer');

    new cdk.CfnOutput(this, 'instancePublicDnsName', { value: jmeterServer.instancePublicDnsName });
  }
  

  private createInstance = (vpc:ec2.Vpc, machineImage: ec2.IMachineImage, instanceType: ec2.InstanceType, securityGroup:ec2.SecurityGroup, instanceName:string) => {
    /*
    const userData = ec2.UserData.forWindows();
    userData.addCommands(cdk.Fn.base64(`
      <powershell>
      cd ~/Documents
      mkdir jmeter
      cd jmeter
      wget https://mirror.navercorp.com/apache//jmeter/binaries/apache-jmeter-5.4.1.tgz -O jmeter.tgz
      tar -zxf jmeter.tgz
      $shell = New-Object -ComObject WScript.Shell
      $shortcut = $shell.CreateShortcut("C:\Users\Administrator\Desktop\jmeter.lnk")
      $shortcut.TargetPath = "C:\Users\Administrator\Documents\jmeter\apache-jmeter-5.4.1\bin\jmeter.bat"
      $shortcut.Save()
      </powershell>
      `
    ));
    */
    return new ec2.Instance(this, instanceName, {
      vpc,
      instanceType: instanceType,
      machineImage: machineImage,
      vpcSubnets: vpc.selectSubnets( {subnetType: ec2.SubnetType.PUBLIC} ),
      keyName: 'dna-serverless-hol-keypair',
      securityGroup: securityGroup,
      userData: ec2.UserData.custom(`
      <powershell>
      cd ~/Documents
      mkdir jmeter
      cd jmeter
      wget https://mirror.navercorp.com/apache/jmeter/binaries/apache-jmeter-5.4.1.tgz -O jmeter.tgz
      tar -zxf jmeter.tgz
      cd ~/Documents/jmeter/apache-jmeter-*/bin
      wget https://raw.githubusercontent.com/skipio11/dna-serverless-hol/master/jmeter/src/conf/jmeter.properties  -O jmeter.properties
      wget https://raw.githubusercontent.com/skipio11/dna-serverless-hol/master/jmeter/src/conf/dna-serverless-hol.jmx -O dna-serverless-hol.jmx
      cd ~/Desktop
      wget https://raw.githubusercontent.com/skipio11/dna-serverless-hol/master/jmeter/src/conf/jmeter.bat -O jmeter.bat
      cd ~/Documents
      mkdir java
      cd java
      wget https://download.java.net/java/ga/jdk11/openjdk-11_windows-x64_bin.zip -O jdk11.zip
      Expand-Archive jdk11.zip -DestinationPath .\
      </powershell>
      <persist>true</persist>
      `
      )
    });
  }
}
