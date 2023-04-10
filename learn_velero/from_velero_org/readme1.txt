
Reference:
https://velero.io/docs/main/contributions/minio/

0. Prepare cluster
kind get clusters

ls .kube/config
k get ns
k get node

I am on the ian-kind-1

create an sample app 
cp -a velero/examples/nginx-app .

k apply -f nginx-app/base.yaml 
k get ns
nginx-example        Active   22s
k get po -n nginx-example
NAME                                READY   STATUS    RESTARTS   AGE
nginx-deployment-7c89967545-jh4n4   1/1     Running   0          58s
nginx-deployment-7c89967545-kfz55   1/1     Running   0          58s

k get svc -n nginx-example
NAME       TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
my-nginx   LoadBalancer   10.96.190.193   <pending>     80:32185/TCP   68s


================================================================================================================
================================================================================================================
1. Install minio 
git clone https://github.com/vmware-tanzu/velero.git
mkdir minio
cp velero/examples/minio/00-minio-deployment.yaml minio/
k apply -f 00-minio-deployment.yaml 

This will create ns velero 
k get po -n velero
NAME                     READY   STATUS      RESTARTS   AGE
minio-8649b94fb5-f72dh   1/1     Running     0          46s
minio-setup-jglkt        0/1     Completed   0          46s

k get svc -n velero
NAME    TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)    AGE
minio   ClusterIP   10.96.77.163   <none>        9000/TCP   2m8s
(we cannot access from outside)


================================================================================================================
================================================================================================================

2. Install velero
velero install \
    --provider aws \
    --plugins velero/velero-plugin-for-aws:v1.2.1 \
    --bucket velero \
    --secret-file ./credentials-velero \
    --use-volume-snapshots=false \
    --backup-location-config region=minio,s3ForcePathStyle="true",s3Url=http://minio.velero.svc:9000

k get po -n velero
NAME                      READY   STATUS      RESTARTS   AGE
minio-8649b94fb5-f72dh    1/1     Running     0          5m10s
minio-setup-jglkt         0/1     Completed   0          5m10s
velero-5bfd884fdc-llc4j   1/1     Running     0          17s

velero and minio are in same namespace.  So http://minio.velero.svc:9000

================================================================================================================
================================================================================================================


3. Backup:
velero backup create nginx-backup --selector app=nginx 
 velero backup get

velero backup create nginx-backup-2 --include-namespaces nginx-example

================================================================================================================
================================================================================================================

4. Restore:
kubectl delete namespace nginx-example 

velero restore create --from-backup nginx-backup
velero restore get 

================================================================================================================
================================================================================================================

5. cleanup 
velero backup delete xxx
kubectl delete namespace/velero clusterrolebinding/velero
kubectl delete crds -l component=velero

