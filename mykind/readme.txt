https://kind.sigs.k8s.io/docs/user/quick-start/
0. ubuntu install
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.18.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
kind v0.18.0 go1.20.2 linux/amd64


1. mac install:
brew install kind
brew uninstall kind
which kind
/usr/local/bin/kind

2. create cluster
- kind create cluster --name ian-kind-1
- kind get clusters
ian-kind-1

kind get kubeconfig --name=ian-kind-1 |tee ~/kubeproj/ian-kind-1.yaml
kind get kubeconfig --name=ian-kind-1 |tee ian-kind-1.yaml

ifconfig|grep 192
vi ian-kind-1.yaml
127.0.0.1 -> 192.168.68.62


3. use cluser
export KUBECONFIG=~/kubeproj/ian-kind-1.yaml
helm install mysql bitnami/mysql -n ian-ns --create-namespace

k get ns
NAME                 STATUS   AGE
default              Active   11m
ian-ns               Active   67s
kube-node-lease      Active   11m
kube-public          Active   11m
kube-system          Active   11m
local-path-storage   Active   11m

k get pv
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                 STORAGECLASS   REASON   AGE
pvc-7b1c8915-4efe-44f3-9215-cf1b72d93dff   8Gi        RWO            Delete           Bound    ian-ns/data-mysql-0   standard                65s

k get csidrivers

k get storageclass
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   false                  12m

k get storageclass (docker desktop)
NAME                 PROVISIONER          RECLAIMPOLICY   VOLUMEBINDINGMODE   ALLOWVOLUMEEXPANSION   AGE
hostpath (default)   docker.io/hostpath   Delete          Immediate           false                  61d
ianz@ianz-mac-0 object-model-service %


=======================================================================
kind create cluster --config ~/kind/create-ip-kind.yaml --name ian-kind-2

docker ps |grep -i kind
d6cb8799c238   kindest/node:v1.25.3   "/usr/local/bin/entr…"   About a minute ago   Up 58 seconds       192.168.68.56:61117->6443/tcp   ian-kind-2

kind get kubeconfig --name=ian-kind-2 |tee ~/kubeproj/ian-kind-2.yaml

kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/v6.2.1/client/config/crd/snapshot.storage.k8s.io_volumesnapshotclasses.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/v6.2.1/client/config/crd/snapshot.storage.k8s.io_volumesnapshotcontents.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/v6.2.1/client/config/crd/snapshot.storage.k8s.io_volumesnapshots.yaml

k get crds
