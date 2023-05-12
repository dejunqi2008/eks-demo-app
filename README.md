
## Simple and dummy node.js app deployment using AWS Elastic Kubernetes Service

 ### Step 1 Create an AWS IAM user

For best practice, we do not do this as root user, instead, we will create an IAM user to do this demo. So first, create an IAM user. See screenshot below, we want console access for us to check the resources we create later, we want customer password (for simplicity, we use static, unchanged password)

and create an access key:

write down the access key and secrete access key, and put it under the `~/.aws/credentials` file, like this

```bash
[default]
aws_access_key_id = XXXXXXXXX
aws_secret_access_key = XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 2: Intsall CLIs and Docker

We need to install 3 CLIs, aws CLI, kubectl CLI, and eksctl CLI. Following are references:

- Install AWS CLI
https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html


- Install Kubernetes CLI (kubectl)
https://docs.aws.amazon.com/eks/latest/userguide/install-kubectl.html

after installing kubectl, configures kubectl so that you can connect to an Amazon EKS cluster.

```
aws eks --region us-west-2 update-kubeconfig --name myeksnode
```

- Instal EKS CLI (eksctl)
https://docs.aws.amazon.com/emr/latest/EMR-on-EKS-DevelopmentGuide/setting-up-eksctl.html


- Install Docker
https://docs.docker.com/engine/install/

After above steps, we can get started

### Step 3: Create a cluster


```bash
eksctl create cluster --region=us-west-2 --name=myeksnode
```

wait for about 10 ~ 15 min, verify by running `kubectl get nodes`

```bash
➜  eks-demo-app git:(mainline) ✗ kubectl get nodes
NAME                                           STATUS   ROLES    AGE   VERSION
ip-192-168-58-176.us-west-2.compute.internal   Ready    <none>   25h   v1.25.7-eks-a59e1f0
ip-192-168-78-100.us-west-2.compute.internal   Ready    <none>   25h   v1.25.7-eks-a59e1f0
```

As can be seen from output, we have created worker nodes, which are just 2 EC2 instances. Verify on aws console, (login in as the IAM user). The good thing about creating cluster using `eksctl` is that it will automatically assign the IAM role & policy to the ec2 instances and security group

![worker_nodes](./screenshots/03worker%20nodes.png)

we have to also edit the inboud rules for the instances inorder for it to be access from external

![inbound_rule_01](./screenshots/10%20inbound%20rules.png)
![inbound_rule_02](./screenshots/11%20edit%20inbound%20rules.png)

### Step 4: Create Elastic Container Registry

We need to create an ECR on AWS so that we can push our dockerized app onto it.

![ecr01](./screenshots/04%20ECR%2001.png)

---

![ecr02](./screenshots/05%20ECR%2002.png)


After creation, login to ECR:

```bash
aws ecr get-login-password --region us-west-2  | docker login --username AWS --password-stdin 886602151343.dkr.ecr.us-west-2.amazonaws.com/eksdemo
```

where the `886602151343.dkr.ecr.us-west-2.amazonaws.com/eksdemo` is the ECR repository URI, run `docker images again`

### Step 5: Dockerized the node application

Sample code here, it is simple express app with one API and a health check


`./app.js`

```javascript
const express = require('express');
const path = require('path');

const indexRouter = require('./routes/index');
const app = express();


app.get('/healthcheck', (req, res) => {
  res.send({status: '200 OK'});
})

app.use('/', indexRouter);
```

`./routes/index.js`

```javascript
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json({data: "Hello Express"})
});

module.exports = router;
```

create a `Dockerfile` under the project root directory

```bash
FROM node:19-alpine # base image

# copy codes to /app/ inside the container
COPY package.json /app/
COPY app.js /app/
COPY routes /app/routes
COPY bin /app/bin

WORKDIR /app # define work directory

RUN npm install # run "npm install"

EXPOSE 3000 # define the port for container, so that the container’s service can be connected to via port 3000

CMD [ "node", "./bin/www.js" ] # start the application
```

Now build the docker image: `docker build -t eks-demo-app .`

```bash
➜  eks-demo-app git:(mainline) ✗ docker build -t eks-demo-app:latest .
[+] Building 2.1s (13/13) FINISHED
 => [internal] load build definition from Dockerfile
 => => transferring dockerfile: 32B
 => [internal] load .dockerignore
 => => transferring context: 2B
 => [internal] load metadata for docker.io/library/node:19-alpine
 => [auth] library/node:pull token for registry-1.docker.io
 => [internal] load build context
 => => transferring context: 209B
 => [1/7] FROM docker.io/library/node:19-alpine@sha256:013a0703e961e02b8be69a548f2356ae5b17bc5b8570f1cdd4b97650200b6860
 => CACHED [2/7] COPY package.json /app/
 => CACHED [3/7] COPY app.js /app/
 => CACHED [4/7] COPY routes /app/routes
 => CACHED [5/7] COPY bin /app/bin
 => CACHED [6/7] WORKDIR /app
 => CACHED [7/7] RUN npm install
 => exporting to image
 => => exporting layers
 => => writing image sha256:c859d550bd87f6c0a25d9aa86c34b5b8be18eac6f8b819e4e956b026f0c3e667
 => => naming to docker.io/library/eks-demo-app
```

check image by `docker images`

```bash
➜  eks-demo-app git:(mainline) ✗ docker images
REPOSITORY                                             TAG       IMAGE ID       CREATED        SIZE
eks-demo-app                                           latest       c859d550bd87   8 hours ago    185MB
```

the docker image is built succefully, next we tag this image (optional)

```bash
docker tag eks-demo-app:latest 886602151343.dkr.ecr.us-west-2.amazonaws.com/eksdemo
```

where the `886602151343.dkr.ecr.us-west-2.amazonaws.com/eksdemo` is the ECR repository URI, run `docker images again`

```bash
➜  eks-demo-app git:(mainline) ✗ docker images
REPOSITORY                                             TAG       IMAGE ID       CREATED        SIZE
886602151343.dkr.ecr.us-west-2.amazonaws.com/eksdemo   latest    c859d550bd87   9 hours ago    185MB
eks-demo-app                                           latest    c859d550bd87   9 hours ago    185MB
```

```bash
docker push 886602151343.dkr.ecr.us-west-2.amazonaws.com/eksdemo
```

check on AWS ECR console, the image was successfully pushed to our repo

![ecr](./screenshots/06%20image.png)

### Step 6: create a deployment



Create a deployment.yml file under project root

```bash
apiVersion: apps/v1
kind: Deployment
metadata:
  name: eks-demo-app-deployment # name it what every you want
  labels:
    app: eks-demo-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: eks-demo-app
  template:
    metadata:
      name: eks-demo-app-pod
      labels:
        app: eks-demo-app
    spec:
      containers:
      - name: eks-demo-app-container
        image: 886602151343.dkr.ecr.us-west-2.amazonaws.com/eksdemo:latest
        imagePullPolicy: Always
        livenessProbe:
          httpGet:
            path: /healthcheck
            port: 3000

# "metadata.labels.app" has to match "spec.selector.matchLabels.app" and "template.metadata.labels.app"
```

Then run:

```bash
kubectl create -f deployment.yml
```

verify from aws console, as can be seen `eks-demo-app-deployment` was created

![deployment](./screenshots/07%20deployment.png)

### Step 7: create NodePortService

So far, the deployment is done, but we are not able to access the web app yet because we have not yet expose the pod to external. Now create a `serviceNodePort.yml` file:

```bash
apiVersion: v1
kind: Service
metadata:
  name: eks-demo-service-np
  labels:
    name: eks-demo-app-deployment
    app: eks-demo-app # have to match the name "metadata.labels.app" in "deployment.yml"
spec:
  type: NodePort
  selector:
    app: eks-demo-app
  ports:
    - protocol: TCP
      port: 3000 # port listening by node app
      nodePort: 30072 # port to be visited
```

run `kubectl create -f serviceNodePort.yml` to execute.

### Step 8: test the app

copy `Public IPv4 DNS` of the pod (EC2 instance)

![ec2_ip](./screenshots/08EC2%20IP.png)

```bash
➜  eks-demo-app git:(mainline) ✗ curl http://ec2-34-212-14-6.us-west-2.compute.amazonaws.com:30072/
{"data":"Hello Express"}
```

Success!

### Step 8: delete every (unless you dont mind being chaged by AWS)

First revert the inbound rules we set in setp 3.
Then run `eksctl delete cluster myeksnode`, where `myeksnode` is the cluster name we created in setp 3

```bash
➜  eks-demo-app git:(mainline) ✗ eksctl delete cluster myeksnode
2023-05-12 00:22:10 [ℹ]  deleting EKS cluster "myeksnode"
2023-05-12 00:22:10 [ℹ]  will drain 0 unmanaged nodegroup(s) in cluster "myeksnode"
2023-05-12 00:22:10 [ℹ]  starting parallel draining, max in-flight of 1
2023-05-12 00:22:11 [ℹ]  deleted 0 Fargate profile(s)
2023-05-12 00:22:12 [✔]  kubeconfig has been updated
2023-05-12 00:22:12 [ℹ]  cleaning up AWS load balancers created by Kubernetes objects of Kind Service or Ingress
2023-05-12 00:22:13 [ℹ]
2 sequential tasks: { delete nodegroup "ng-2b9774ad", delete cluster control plane "myeksnode" [async]
2023-05-12 00:22:13 [ℹ]  will delete stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:22:13 [ℹ]  waiting for stack "eksctl-myeksnode-nodegroup-ng-2b9774ad" to get deleted
2023-05-12 00:22:13 [ℹ]  waiting for CloudFormation stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:22:43 [ℹ]  waiting for CloudFormation stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:23:14 [ℹ]  waiting for CloudFormation stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:24:54 [ℹ]  waiting for CloudFormation stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:26:53 [ℹ]  waiting for CloudFormation stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:28:05 [ℹ]  waiting for CloudFormation stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:28:41 [ℹ]  waiting for CloudFormation stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:29:17 [ℹ]  waiting for CloudFormation stack "eksctl-myeksnode-nodegroup-ng-2b9774ad"
2023-05-12 00:29:18 [ℹ]  will delete stack "eksctl-myeksnode-cluster"
2023-05-12 00:29:18 [✔]  all cluster resources were deleted
```

