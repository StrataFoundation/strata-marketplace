import React, { useState } from "react";
import { useRouter } from 'next/router'
import { Spinner, useBondingPricing, usePublicKey, useStrataSdks, useTokenBonding, useTokenMetadata, Notification, useProvider, useMint } from "@strata-foundation/react";
import { FormLabel, Input, Text, Box, Image, Heading, Container, VStack, FormHelperText, Button, Alert, Center } from "@chakra-ui/react";
import { SplTokenBonding } from "@strata-foundation/spl-token-bonding";
import { useAsyncCallback } from "react-async-hook";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import toast from "react-hot-toast";
import { GetServerSideProps, InferGetServerSidePropsType, NextPage } from "next";
import BN from "bn.js";
import { DEFAULT_ENDPOINT } from "../components/Wallet";
import { Provider } from "@project-serum/anchor";
import { SplTokenMetadata, getImageFromMeta } from "@strata-foundation/spl-utils";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import Head from "next/head";
import styles from '../styles/Home.module.css';
import { MarketplaceItem } from "../components/MarketplaceItem";

if (typeof localStorage === "undefined" || localStorage === null) {
  var LocalStorage = require('node-localstorage').LocalStorage;
  localStorage = new LocalStorage('./scratch');
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const connection = new Connection(DEFAULT_ENDPOINT);
  const provider = new Provider(connection, new NodeWallet(Keypair.generate()), {})
  const tokenBondingSdk = await SplTokenBonding.init(provider);
  const tokenBondingAcct = (await tokenBondingSdk.getTokenBonding(new PublicKey(context.params?.tokenBondingKey as string)))!;
  const tokenMetadataSdk = await SplTokenMetadata.init(provider);
  const metadataAcc = (await tokenMetadataSdk.getMetadata(await Metadata.getPDA(tokenBondingAcct.targetMint)))!
  const metadata = await SplTokenMetadata.getArweaveMetadata(metadataAcc.data.uri);


  return {
    props: {
      name: metadataAcc.data.name,
      description: metadata?.description,
      image: getImageFromMeta(metadata),
    }
  }
}


export const MarketDisplay: NextPage = ({ name, image, description }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter()
  const { tokenBondingKey: tokenBondingKeyRaw } = router.query;
  const tokenBondingKey = usePublicKey(tokenBondingKeyRaw as string);

  return <Box h="100vh">
    <Head>
      <title>{name}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={name} />
      <meta property="og:image" content={image} />
      <meta property="og:description" content={description} />
      <link rel="icon" href="/favicon.ico" />
    </Head>
    <Box w="full" h="full" overflow="auto" paddingTop={{ sm: "18px" }}>
      <Center flexGrow={1}>
        <Center bg="white" shadow="xl" rounded="lg" w="420px">
          <MarketplaceItem 
            name={name}
            description={description}
            image={image}
            tokenBondingKey={tokenBondingKey}
          />
        </Center>
      </Center>
    </Box>
  </Box>
}

export default MarketDisplay;