0. kubernetes Cluster
kind create cluster --name ian-kind-1
kind get clusters

ls .kube/config
k get ns
k get node
I am on the ian-kind-1

======================================================================================================================
======================================================================================================================

1. Reference: 
youtube: https://www.youtube.com/watch?v=C9hzrexaIDA
notes: https://github.com/justmeandopensource/kubernetes/blob/master/docs/setup-velero-notes.md


======================================================================================================================
======================================================================================================================

2. Setup minio
2.1. install minio
docker pull minio/minio

mkdir -p ~/minio/data


docker run \
   -p 9000:9000 \
   -p 9090:9090 \
   --user $(id -u):$(id -g) \
   --name minio1 \
   -e "MINIO_ROOT_USER=admin" \
   -e "MINIO_ROOT_PASSWORD=admin123" \
   -v ${HOME}/minio/data:/data \
   quay.io/minio/minio server /data --console-address ":9090"

http://127.0.0.1:9090/

create a bucket called ian-bucket
docker container ls -a


minio:
https://min.io/docs/minio/container/index.html

helm install my-minio bitnami/minio -n my-minio --create-namespace
export ROOT_USER=$(kubectl get secret --namespace my-minio my-minio -o jsonpath="{.data.root-user}" | base64 -d)
echo $ROOT_USER 
admin
echo $ROOT_PASSWORD 
mQXITqfAla
http://127.0.0.1:9001
create bucket ian-bucket


======================================================================================================================
======================================================================================================================

3. Download and Install velero



3.1 download velero
cd ~/learn_velero
download velero-v1.10.2-linux-amd64.tar.gz from https://github.com/vmware-tanzu/velero/releases/tag/v1.10.2
tar xvfz velero-v1.10.2-linux-amd64.tar.gz
sudo mv velero-v1.10.2-linux-amd64/velero /usr/local/bin
rm -rf velero*

velero version
  Client:
	Version: v1.10.2


3.2 install velero
https://velero.io/docs/main/contributions/minio/

cd ~/learn_velero


combined:
velero install \
   --provider aws \
   --plugins velero/velero-plugin-for-aws:v1.2.1 \
   --bucket ian-bucket \
   --secret-file ./minio.credentials \
   --use-volume-snapshots=false \
   --backup-location-config region=minio,s3ForcePathStyle="true",s3Url=http://192.168.68.62:9000

on docker destop: 192.168.68.62 works.
on kind cluster 192.168.68.62 works.

======================================================================================================================
======================================================================================================================

4. Install an app
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install my-nginx bitnami/nginx -n my-nginx --create-namespace
kubectl patch svc my-nginx  -p '{"spec": {"type": "LoadBalancer", "externalIPs":["192.168.68.62"]}}' -n my-nginx
k get svc -n my-nginx 
The external ip is always in pending state

======================================================================================================================
======================================================================================================================
5. Backup

velero backup create ian-bk1 --include-namespaces my-nginx 
velero backup get
velero backup describe ian-bk1
velero backup logs ian-bk1
velero backup delete ian-bk1
(to get rid of problem backups k delete ns velero)

======================================================================================================================
======================================================================================================================
6. Restore
velero restore create --from-backup nginx-backup
velero restore get


7. With PVC
helm install mysql bitnami/mysql -n mysql --create-namespace
k get po -n mysql
k get pv 

velero backup create ian-bkm1 --include-namespaces mysql
velero backup get 

k delete ns mysql
velero restore create --from-backup ian-bkm1
k get po -n mysql
k get pvc -n mysql 
k get pv 

