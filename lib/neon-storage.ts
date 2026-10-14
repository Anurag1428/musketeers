import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3"

export function getS3Client() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const region = process.env.AWS_REGION || "us-east-1"

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS S3 environment variables for Neon Object Storage are not configured")
  }

  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  })
}

export async function testObjectStorage() {
  const s3 = getS3Client()
  const bucketName = "assets"
  const testKey = `test/ping-${Date.now()}.txt`
  const testContent = `Neon Object Storage test written at ${new Date().toISOString()}`

  // 1. Put object
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: testContent,
      ContentType: "text/plain",
    })
  )

  // 2. Get object
  const getRes = await s3.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: testKey,
    })
  )
  const bodyString = await getRes.Body?.transformToString()

  // 3. Clean up test object
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: testKey,
    })
  )

  return {
    success: bodyString === testContent,
    bucket: bucketName,
    key: testKey,
    contentMatch: bodyString === testContent,
    retrievedContent: bodyString,
  }
}
