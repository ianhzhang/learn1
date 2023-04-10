# https://raw.githubusercontent.com/minio/docs/master/source/extra/examples/minio-dev.yaml
# https://min.io/docs/minio/kubernetes/upstream/index.html


k apply -f minio-dev.yaml

k get all -n minio-dev 
kubectl port-forward pod/minio 9000 9090 -n minio-dev

http://localhost:9090/