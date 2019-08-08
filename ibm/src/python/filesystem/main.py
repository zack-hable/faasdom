import json
import time
import os
import shutil

def main(request):

    if os.path.exists("/tmp/test"):
        shutil.rmtree("/tmp/test")

    if not os.path.exists("/tmp/test"):
        os.makedirs("/tmp/test")

    f=open("/proc/self/cgroup", "r")
    if f.mode == 'r':
        instance_id =f.read()
    f.close()

    f=open("/sys/class/dmi/id/product_uuid", "r")
    if f.mode == 'r':
        machine_id =f.read()
    f.close()
        
    f=open("/proc/cpuinfo", "r")
    if f.mode == 'r':
        cpuinfo =f.read()
    f.close()
        
    f=open("/proc/meminfo", "r")
    if f.mode == 'r':
        meminfo =f.read()
    f.close()
        
    f=open("/proc/uptime", "r")
    if f.mode == 'r':
        uptime =f.read()
    f.close()

    n, size = 10000, 10240

    if request.get("n") != None:
        n = int(request.get("n"))
    else:
        n = 10000

    if request.get("size") is not None:
        size = int(request.get("size"))
    else:
        size = 10240

    text = ""

    for i in range(1, size):
        text += "A"
        
    startWrite = time.time()
    for i in range(0,n):
        filehandle = open('/tmp/test/'+str(i)+'.txt', 'w')
        filehandle.write(text)
        filehandle.close()
    
    endWrite = time.time()
    
    startRead = time.time()
    for i in range(0,n):
        filehandle = open('/tmp/test/'+str(i)+'.txt', 'r')
        test = filehandle.read()
        filehandle.close()
    
    endRead = time.time()
    
    files = os.listdir("/tmp/test")

    return {
        'success': len(files) == n,
        'payload': {
            "test": "filesystem test",
            "n": len(files),
            "size": size,
            "timeWrite(ms)": (endWrite-startWrite)*1000,
            "timeRead(ms)": (endRead-startRead)*1000
        },
        'metrics': {
            'machineId': machine_id,
            'instanceId': instance_id,
            'cpu': cpuinfo,
            'mem': meminfo,
            'uptime': uptime
        }
    }