---
id: network-protocol
title: Protocole Réseau
sidebar_label: Protocole Réseau
sidebar_position: 5
description: Comprendre le protocole réseau du serveur Hytale
---

# Protocole Réseau

Ce document décrit le protocole réseau Hytale utilisé pour la communication entre les clients et les serveurs. Les informations sont dérivées de l'analyse du code serveur décompilé.

## Aperçu du Protocole

Hytale utilise un protocole réseau moderne et efficace construit sur QUIC (Quick UDP Internet Connections).

| Propriété | Valeur |
|-----------|--------|
| Transport | QUIC sur UDP |
| Port par défaut | 5520 |
| Protocole applicatif | `hytale/1` |

QUIC offre plusieurs avantages par rapport au TCP traditionnel :
- **Latence réduite** : Établissement de connexion plus rapide avec prise en charge du 0-RTT
- **Flux multiplexés** : Plusieurs flux de données sans blocage en tête de ligne
- **Chiffrement intégré** : TLS 1.3 intégré au protocole
- **Migration de connexion** : Gère les changements de réseau de manière élégante

## Constantes du Protocole

Le protocole utilise les constantes suivantes définies dans `ProtocolSettings.java` :

| Constante | Valeur | Description |
|-----------|--------|-------------|
| `PROTOCOL_HASH` | `6708f121966c1c443f4b0eb525b2f81d0a8dc61f5003a692a8fa157e5e02cea9` | Hachage SHA-256 pour la validation de version |
| `PROTOCOL_VERSION` | 1 | Numéro de version du protocole |
| `PACKET_COUNT` | 268 | Nombre total de types de paquets |
| `STRUCT_COUNT` | 315 | Nombre total de structures de données |
| `ENUM_COUNT` | 136 | Nombre total d'énumérations |
| `MAX_PACKET_SIZE` | 1 677 721 600 | Taille maximale d'un paquet en octets (~1,6 Go) |
| `DEFAULT_PORT` | 5520 | Port serveur par défaut |

Le `PROTOCOL_HASH` est utilisé lors de la poignée de main pour s'assurer que le client et le serveur utilisent des versions de protocole compatibles.

## Interface Packet

Tous les paquets implémentent l'interface `Packet` (`com.hypixel.hytale.protocol.Packet`) :

```java
public interface Packet {
   int getId();
   void serialize(@Nonnull ByteBuf var1);
   int computeSize();
}
```

| Méthode | Description |
|---------|-------------|
| `getId()` | Retourne l'identifiant unique du paquet |
| `serialize(ByteBuf)` | Écrit les données du paquet dans un tampon d'octets |
| `computeSize()` | Calcule la taille sérialisée du paquet |

## Sérialisation

### Structure des Trames

Les paquets sont transmis sous forme de trames binaires préfixées par leur longueur :

```
+--------------------+------------------------+-------------------------+
| Longueur (4 octets) | ID du paquet (4 octets) | Charge utile (variable) |
+--------------------+------------------------+-------------------------+
```

| Composant | Taille | Description |
|-----------|--------|-------------|
| Préfixe de longueur | 4 octets | Longueur totale de la trame |
| ID du paquet | 4 octets | Identifie le type de paquet |
| Charge utile | Variable | Données spécifiques au paquet |
| **Taille minimale de trame** | 8 octets | Longueur + ID du paquet |

### Compression

Les paquets volumineux utilisent la compression **Zstd** (Zstandard) pour une utilisation efficace de la bande passante. Zstd offre :
- Des vitesses de compression et de décompression rapides
- Des taux de compression élevés
- Une prise en charge du streaming

Les paquets utilisant la compression ont un indicateur `IS_COMPRESSED = true` dans leur définition de classe.

### Entiers à Longueur Variable (VarInt)

Hytale implémente son propre encodage VarInt pour les entiers à longueur variable dans `com.hypixel.hytale.protocol.io.VarInt` :

```java
public static void write(@Nonnull ByteBuf buf, int value) {
   if (value < 0) {
      throw new IllegalArgumentException("VarInt cannot encode negative values: " + value);
   } else {
      while ((value & -128) != 0) {
         buf.writeByte(value & 127 | 128);
         value >>>= 7;
      }
      buf.writeByte(value);
   }
}
```

Caractéristiques principales :
- N'encode que les valeurs non négatives
- Utilise 7 bits par octet pour les données, 1 bit comme indicateur de continuation
- Les valeurs plus petites utilisent moins d'octets (efficace pour les petits nombres courants)

## Directions des Paquets

Les paquets circulent dans trois directions :

| Direction | Description | Exemple |
|-----------|-------------|---------|
| **Client vers Serveur** | Envoyés par les clients, traités par les gestionnaires de paquets du serveur | `ClientMovement`, `ChatMessage` |
| **Serveur vers Client** | Envoyés par le serveur, traités par le client | `SetChunk`, `EntityUpdates` |
| **Bidirectionnel** | Peuvent être envoyés par l'une ou l'autre partie | `Disconnect`, `SetPaused` |

Les paquets client vers serveur sont enregistrés dans `GamePacketHandler.registerHandlers()` :

```java
this.registerHandler(108, p -> this.handle((ClientMovement)p));
this.registerHandler(211, p -> this.handle((ChatMessage)p));
```

Les paquets serveur vers client sont encodés via `PacketEncoder.encode()` et envoyés à travers le canal réseau.

## Flux de Connexion

### Processus de Poignée de Main

1. **Le client se connecte** via le transport QUIC
2. **Le client envoie un paquet `Connect`** (ID 0) avec :
   - Le hachage du protocole pour la validation de version
   - Le type de client (Game ou Editor)
   - Le code de langue
   - Le jeton d'identité pour l'authentification
   - L'UUID et le nom d'utilisateur du joueur
3. **Le serveur valide** le hachage du protocole par rapport à la valeur attendue
4. **Le serveur valide** les identifiants d'authentification
5. **Le serveur répond** avec soit :
   - `ConnectAccept` (ID 14) - Connexion acceptée, peut inclure un défi de mot de passe
   - `Disconnect` (ID 1) - Connexion refusée avec raison
6. **L'authentification continue** via `AuthenticationPacketHandler`
7. **La phase de configuration** passe à `SetupPacketHandler`
8. **Le jeu** passe à `GamePacketHandler`

```
Client                                Serveur
   |                                    |
   |  -------- Connexion QUIC --------> |
   |                                    |
   |  -------- Connect (ID 0) --------> |
   |       protocolHash, clientType,    |
   |       language, identityToken,     |
   |       uuid, username               |
   |                                    |
   |  <----- ConnectAccept (ID 14) ---- |
   |       passwordChallenge (optionnel)|
   |                                    |
   |  -------- AuthToken (ID 12) -----> |
   |       accessToken,                 |
   |       serverAuthorizationGrant     |
   |                                    |
   |  <------ JoinWorld (ID 104) ------ |
   |                                    |
```

## Catégories de Paquets

Les paquets sont organisés en catégories fonctionnelles :

### Paquets de Connexion

Gèrent le cycle de vie de la connexion.

| Paquet | ID | Direction | Description |
|--------|-----|-----------|-------------|
| `Connect` | 0 | Client -> Serveur | Requête de connexion initiale |
| `Disconnect` | 1 | Bidirectionnel | Terminaison de connexion |
| `Ping` | 2 | Serveur -> Client | Requête de mesure de latence |
| `Pong` | 3 | Client -> Serveur | Réponse de mesure de latence |

### Paquets d'Authentification

Gèrent le flux d'authentification.

| Paquet | ID | Direction | Description |
|--------|-----|-----------|-------------|
| `Status` | 10 | Serveur -> Client | Informations sur le statut du serveur |
| `AuthToken` | 12 | Client -> Serveur | Soumission du jeton d'authentification |
| `ConnectAccept` | 14 | Serveur -> Client | Réponse de connexion acceptée |

### Paquets Joueur

Gèrent l'état et les actions du joueur.

| Paquet | ID | Direction | Description |
|--------|-----|-----------|-------------|
| `JoinWorld` | 104 | Serveur -> Client | Rejoindre un monde |
| `ClientReady` | 105 | Client -> Serveur | État prêt du client |
| `ClientMovement` | 108 | Client -> Serveur | Mise à jour du mouvement du joueur |
| `MouseInteraction` | 111 | Client -> Serveur | Événements d'entrée souris |
| `SyncPlayerPreferences` | 116 | Client -> Serveur | Synchroniser les paramètres du joueur |
| `ClientPlaceBlock` | 117 | Client -> Serveur | Requête de placement de bloc |
| `RemoveMapMarker` | 119 | Client -> Serveur | Supprimer un marqueur de carte |

### Paquets de Monde

Synchronisent les données du monde.

| Paquet | ID | Direction | Compressé | Description |
|--------|-----|-----------|-----------|-------------|
| `SetChunk` | 131 | Serveur -> Client | Oui | Transfert de données de chunk |
| `SetPaused` | 158 | Bidirectionnel | Non | Mettre en pause l'état du jeu |

### Paquets d'Entité

Synchronisent l'état des entités.

| Paquet | ID | Direction | Compressé | Description |
|--------|-----|-----------|-----------|-------------|
| `EntityUpdates` | 161 | Serveur -> Client | Oui | Mises à jour de l'état des entités |
| `MountMovement` | 166 | Client -> Serveur | Non | Mouvement d'entité montée |

### Paquets d'Inventaire

Gèrent l'inventaire du joueur.

| Paquet | ID | Direction | Compressé | Description |
|--------|-----|-----------|-----------|-------------|
| `UpdatePlayerInventory` | 170 | Serveur -> Client | Oui | Synchronisation complète de l'inventaire |

### Paquets de Fenêtre/Interface

Gèrent les interactions d'interface utilisateur.

| Paquet | ID | Direction | Description |
|--------|-----|-----------|-------------|
| `CloseWindow` | 202 | Client -> Serveur | Fermer une fenêtre d'interface |
| `SendWindowAction` | 203 | Client -> Serveur | Interaction avec une fenêtre |
| `ClientOpenWindow` | 204 | Client -> Serveur | Requête d'ouverture de fenêtre |

### Paquets d'Interface

Gestion du chat et de l'interface.

| Paquet | ID | Direction | Description |
|--------|-----|-----------|-------------|
| `ChatMessage` | 211 | Client -> Serveur | Envoyer un message de chat |
| `CustomPageEvent` | 219 | Client -> Serveur | Interaction avec une page personnalisée |
| `UpdateLanguage` | 232 | Client -> Serveur | Changer le paramètre de langue |

### Paquets de Carte du Monde

Interactions avec la carte du monde.

| Paquet | ID | Direction | Description |
|--------|-----|-----------|-------------|
| `UpdateWorldMapVisible` | 243 | Client -> Serveur | Basculer la visibilité de la carte |
| `TeleportToWorldMapMarker` | 244 | Client -> Serveur | Se téléporter à un marqueur |
| `TeleportToWorldMapPosition` | 245 | Client -> Serveur | Se téléporter à une position |

### Paquets de Configuration

Configuration initiale du client.

| Paquet | ID | Direction | Description |
|--------|-----|-----------|-------------|
| `RequestAssets` | 23 | Client -> Serveur | Demander les données d'assets |
| `ViewRadius` | 32 | Client -> Serveur | Définir la distance de vue |

### Paquets Spécialisés

| Catégorie | Paquets | Description |
|-----------|---------|-------------|
| Accès Serveur | `UpdateServerAccess` (251), `SetServerAccess` (252) | Contrôle d'accès en solo |
| Machinima | `RequestMachinimaActorModel` (260), `UpdateMachinimaScene` (262) | Outils cinématiques |
| Caméra | `RequestFlyCameraMode` (282) | Contrôle de la caméra |
| Interaction | `SyncInteractionChains` (290) | Chaînes d'interaction |
| Assets | 40+ paquets | Synchronisation des assets |

## Détails des Paquets Clés

### Connect (ID 0)

Paquet de connexion initial envoyé par les clients.

| Champ | Type | Description |
|-------|------|-------------|
| `protocolHash` | String | Hachage du protocole ASCII de 64 caractères |
| `clientType` | ClientType | Game ou Editor |
| `language` | String | Code de langue (ex: "en-US") |
| `identityToken` | String | Jeton d'identité d'authentification |
| `uuid` | UUID | UUID du joueur |
| `username` | String | Nom d'utilisateur du joueur (max 16 caractères) |
| `referralData` | byte[] | Données de référence optionnelles (max 4096 octets) |
| `referralSource` | HostAddress | Source de référence optionnelle |

**Taille maximale** : 38 161 octets

### Disconnect (ID 1)

Paquet de terminaison de connexion.

| Champ | Type | Description |
|-------|------|-------------|
| `reason` | String | Message de raison de déconnexion |
| `type` | DisconnectType | Disconnect, Crash, etc. |

**Taille maximale** : 16 384 007 octets

### Ping/Pong (ID 2/3)

Paquets de mesure de latence.

**Ping** (Serveur -> Client) :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | int | Identifiant du ping |
| `time` | InstantData | Données d'horodatage |
| `lastPingValueRaw` | int | Dernier ping brut |
| `lastPingValueDirect` | int | Dernier ping direct |
| `lastPingValueTick` | int | Dernier ping tick |

**Pong** (Client -> Serveur) :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | int | Identifiant de ping correspondant |
| `time` | InstantData | Données d'horodatage |
| `type` | PongType | Raw, Direct, ou Tick |
| `packetQueueSize` | short | Taille de la file d'attente du client |

### ClientMovement (ID 108)

Paquet d'état de mouvement du joueur.

| Champ | Type | Description |
|-------|------|-------------|
| `movementStates` | MovementStates | Indicateurs de mouvement |
| `relativePosition` | HalfFloatPosition | Delta de position |
| `absolutePosition` | Position | Coordonnées absolues |
| `bodyOrientation` | Direction | Rotation du corps |
| `lookOrientation` | Direction | Direction du regard/tête |
| `teleportAck` | TeleportAck | Accusé de réception de téléportation |
| `wishMovement` | Position | Mouvement souhaité |
| `velocity` | Vector3d | Vélocité actuelle |
| `mountedTo` | int | ID de l'entité montée |
| `riderMovementStates` | MovementStates | États de mouvement du cavalier |

**Taille maximale** : 153 octets

### SetChunk (ID 131)

Paquet de données de chunk (compressé).

| Champ | Type | Description |
|-------|------|-------------|
| `x` | int | Coordonnée X du chunk |
| `y` | int | Coordonnée Y du chunk |
| `z` | int | Coordonnée Z du chunk |
| `localLight` | byte[] | Données d'éclairage local |
| `globalLight` | byte[] | Données d'éclairage global |
| `data` | byte[] | Données de blocs |

**Taille maximale** : 12 288 040 octets
**Compression** : Zstd

### EntityUpdates (ID 161)

Paquet de synchronisation des entités (compressé).

| Champ | Type | Description |
|-------|------|-------------|
| `removed` | int[] | IDs des entités supprimées |
| `updates` | EntityUpdate[] | Mises à jour de l'état des entités |

**Taille maximale** : 1 677 721 600 octets
**Compression** : Zstd

### UpdatePlayerInventory (ID 170)

Paquet de synchronisation complète de l'inventaire (compressé).

| Champ | Type | Description |
|-------|------|-------------|
| `storage` | InventorySection | Section de stockage |
| `armor` | InventorySection | Section d'armure |
| `hotbar` | InventorySection | Section de barre d'accès rapide |
| `utility` | InventorySection | Objets utilitaires |
| `builderMaterial` | InventorySection | Matériaux de construction |
| `tools` | InventorySection | Section d'outils |
| `backpack` | InventorySection | Section de sac à dos |
| `sortType` | SortType | Type de tri actuel |

**Compression** : Zstd

### ChatMessage (ID 211)

Paquet de message de chat.

| Champ | Type | Description |
|-------|------|-------------|
| `message` | String | Contenu du message (max 4 096 000 caractères) |

**Taille maximale** : 16 384 006 octets

## Types de Déconnexion

L'énumération `DisconnectType` définit diverses raisons de déconnexion :

| Type | Description |
|------|-------------|
| `Disconnect` | Déconnexion normale |
| `Crash` | Plantage client/serveur |

## Structures Detaillees des Paquets

Cette section fournit les structures binaires detaillees pour les categories de paquets prioritaires, derivees du code source decompile.

### Paquets d'Entite

Les paquets d'entite gerent la synchronisation des entites entre le serveur et les clients, y compris la creation, la mise a jour et la suppression des entites.

#### EntityUpdates (ID 161)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Paquet de mise a jour groupee qui synchronise plusieurs etats d'entites. Envoye a chaque tick pour les entites dans la distance de vue du joueur.

```
+------------------+------------------+--------------------+--------------------+
| Bits Null (1)    | removed Offset   | updates Offset     | Donnees Variables  |
| (octet)          | (int32 LE)       | (int32 LE)         | (variable)         |
+------------------+------------------+--------------------+--------------------+
```

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Masque : bit 0 = removed present, bit 1 = updates present |
| 1 | removedOffset | int32 LE | 4 | Offset vers le tableau removed (-1 si null) |
| 5 | updatesOffset | int32 LE | 4 | Offset vers le tableau updates (-1 si null) |
| 9 | removed | VarInt + int32[] | Variable | Tableau des IDs reseau des entites a supprimer |
| - | updates | VarInt + EntityUpdate[] | Variable | Tableau des mises a jour d'entites |

**Structure EntityUpdate :**

| Champ | Type | Taille | Description |
|-------|------|--------|-------------|
| nullBits | octet | 1 | Indicateurs de presence pour les champs optionnels |
| networkId | int32 LE | 4 | Identifiant reseau de l'entite |
| removedOffset | int32 LE | 4 | Offset vers les composants supprimes |
| updatesOffset | int32 LE | 4 | Offset vers les mises a jour de composants |
| removed | ComponentUpdateType[] | Variable | Composants supprimes de l'entite |
| updates | ComponentUpdate[] | Variable | Mises a jour de l'etat des composants |

**Taille maximale :** 1 677 721 600 octets

#### PlayAnimation (ID 162)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Declenche une animation sur une entite. Utilise pour les animations de combat, les emotes et autres retours visuels.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Masque pour les champs nullables |
| 1 | entityId | int32 LE | 4 | ID reseau de l'entite cible |
| 5 | slot | octet | 1 | Valeur enum AnimationSlot (Movement, Action, etc.) |
| 6 | itemAnimationsIdOffset | int32 LE | 4 | Offset vers la chaine d'animations d'objet |
| 10 | animationIdOffset | int32 LE | 4 | Offset vers la chaine d'ID d'animation |
| 14 | itemAnimationsId | VarString | Variable | ID du set d'animations d'objet (optionnel) |
| - | animationId | VarString | Variable | Identifiant de l'animation (optionnel) |

**Taille fixe :** 14 octets (minimum)
**Taille maximale :** 32 768 024 octets

#### ChangeVelocity (ID 163)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Modifie la velocite d'une entite. Utilise pour le recul, les explosions et les effets physiques.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateur de presence pour config |
| 1 | x | float LE | 4 | Composante X de la velocite |
| 5 | y | float LE | 4 | Composante Y de la velocite |
| 9 | z | float LE | 4 | Composante Z de la velocite |
| 13 | changeType | octet | 1 | ChangeVelocityType : 0=Add, 1=Set, 2=Multiply |
| 14 | config | VelocityConfig | 21 | Configuration de velocite optionnelle |

**Taille fixe :** 35 octets

#### ApplyKnockback (ID 164)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Applique une force de recul a l'entite joueur du client, typiquement depuis le combat ou les explosions.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = hitPosition present |
| 1 | hitPosition | Position | 24 | Position d'impact (x, y, z en doubles) |
| 25 | x | float LE | 4 | Force de recul X |
| 29 | y | float LE | 4 | Force de recul Y |
| 33 | z | float LE | 4 | Force de recul Z |
| 37 | changeType | octet | 1 | Enum ChangeVelocityType |

**Taille fixe :** 38 octets

#### SpawnModelParticles (ID 165)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Fait apparaitre des effets de particules attaches aux os du modele d'une entite.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | entityId | int32 LE | 4 | ID reseau de l'entite |
| 5 | modelParticles | ModelParticle[] | Variable | Tableau de configurations de particules |

**Taille maximale :** 1 677 721 600 octets

#### MountMovement (ID 166)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Envoie les entrees de mouvement pour une entite montee (vehicule, creature chevauchable).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence pour les champs optionnels |
| 1 | absolutePosition | Position | 24 | Position absolue de la monture dans le monde |
| 25 | bodyOrientation | Direction | 12 | Rotation du corps de la monture (yaw, pitch, roll en floats) |
| 37 | movementStates | MovementStates | 22 | Indicateurs et etats de mouvement |

**Taille fixe :** 59 octets

#### SetEntitySeed (ID 160)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Definit la graine aleatoire pour une entite, utilisee pour les effets proceduraux deterministes.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | entitySeed | int32 LE | 4 | Valeur de la graine aleatoire |

**Taille fixe :** 4 octets

---

### Paquets Joueur

Les paquets joueur gerent l'etat du joueur, le mouvement, les actions et le mode de jeu.

#### JoinWorld (ID 104)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Envoye lorsqu'un joueur rejoint ou transite vers un monde. Declenche le chargement du monde sur le client.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | clearWorld | octet | 1 | Booleen : effacer les donnees du monde existant |
| 1 | fadeInOut | octet | 1 | Booleen : utiliser une transition en fondu |
| 2 | worldUuid | UUID | 16 | Identifiant unique du monde (deux int64 LE) |

**Taille fixe :** 18 octets

#### ClientReady (ID 105)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Signale l'etat de preparation du client pendant le chargement du monde.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | readyForChunks | octet | 1 | Booleen : pret a recevoir les donnees de chunk |
| 1 | readyForGameplay | octet | 1 | Booleen : pret pour les paquets de gameplay |

**Taille fixe :** 2 octets

#### ClientMovement (ID 108)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Paquet de mouvement principal envoye a chaque tick contenant la position, l'orientation et l'etat de mouvement du joueur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet[2] | 2 | Indicateurs de presence pour 10 champs optionnels |
| 2 | movementStates | MovementStates | 22 | Indicateurs de mouvement (saut, sprint, accroupi, etc.) |
| 24 | relativePosition | HalfFloatPosition | 6 | Delta de position (floats demi-precision) |
| 30 | absolutePosition | Position | 24 | Coordonnees absolues du monde (3x double) |
| 54 | bodyOrientation | Direction | 12 | Rotation du corps (3x float) |
| 66 | lookOrientation | Direction | 12 | Direction de la camera/tete (3x float) |
| 78 | teleportAck | TeleportAck | 1 | Accuse de reception de teleportation serveur |
| 79 | wishMovement | Position | 24 | Direction de mouvement souhaitee |
| 103 | velocity | Vector3d | 24 | Velocite actuelle (3x double) |
| 127 | mountedTo | int32 LE | 4 | ID de l'entite si monte (-1 sinon) |
| 131 | riderMovementStates | MovementStates | 22 | Etats de mouvement en tant que cavalier |

**Taille fixe :** 153 octets

#### ClientTeleport (ID 109)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Teleporte le joueur a une nouvelle position, utilise pour la reapparition, les portails et les commandes.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateur de presence pour modelTransform |
| 1 | teleportId | octet | 1 | ID de sequence de teleportation pour l'accuse de reception |
| 2 | modelTransform | ModelTransform | 49 | Donnees de position et rotation |
| 51 | resetVelocity | octet | 1 | Booleen : reinitialiser la velocite du joueur |

**Taille fixe :** 52 octets

#### MouseInteraction (ID 111)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Envoie les evenements d'entree souris incluant les clics et les interactions avec le monde.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence pour les champs optionnels |
| 1 | clientTimestamp | int64 LE | 8 | Horodatage cote client |
| 9 | activeSlot | int32 LE | 4 | Emplacement de la barre d'acces rapide selectionne |
| 13 | screenPoint | Vector2f | 8 | Coordonnees ecran de la souris (optionnel) |
| 21 | mouseButton | MouseButtonEvent | 3 | Etat du bouton (optionnel) |
| 24 | worldInteraction | WorldInteraction | 20 | Donnees d'interaction bloc/entite (optionnel) |
| 44 | itemInHandIdOffset | int32 LE | 4 | Offset vers la chaine d'ID d'objet |
| 48 | mouseMotionOffset | int32 LE | 4 | Offset vers les donnees de mouvement souris |

**Taille fixe :** 52 octets (minimum)
**Taille maximale :** 20 480 071 octets

#### ClientPlaceBlock (ID 117)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Requete pour placer un bloc a une position specifique.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = position, bit 1 = rotation |
| 1 | position | BlockPosition | 12 | Coordonnees du bloc (3x int32) |
| 13 | rotation | BlockRotation | 3 | Etat de rotation du bloc |
| 16 | placedBlockId | int32 LE | 4 | Identifiant du type de bloc |

**Taille fixe :** 20 octets

#### SetGameMode (ID 101)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Change le mode de jeu du joueur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | gameMode | octet | 1 | Enum GameMode : Adventure, Creative, Spectator |

**Taille fixe :** 1 octet

---

### Paquets de Monde

Les paquets de monde gerent les donnees de chunks, les mises a jour de blocs et la synchronisation de l'etat du monde.

#### SetChunk (ID 131)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Envoie les donnees de chunk au client incluant les donnees de blocs et les informations d'eclairage.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence pour les tableaux de donnees |
| 1 | x | int32 LE | 4 | Coordonnee X du chunk |
| 5 | y | int32 LE | 4 | Coordonnee Y du chunk |
| 9 | z | int32 LE | 4 | Coordonnee Z du chunk |
| 13 | localLightOffset | int32 LE | 4 | Offset vers les donnees d'eclairage local |
| 17 | globalLightOffset | int32 LE | 4 | Offset vers les donnees d'eclairage global |
| 21 | dataOffset | int32 LE | 4 | Offset vers les donnees de blocs |
| 25 | localLight | VarInt + octet[] | Variable | Niveaux de lumiere locale par bloc |
| - | globalLight | VarInt + octet[] | Variable | Niveaux de lumiere globale (ciel) |
| - | data | VarInt + octet[] | Variable | Donnees de blocs compressees |

**Taille fixe :** 25 octets (minimum)
**Taille maximale :** 12 288 040 octets

#### UnloadChunk (ID 135)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Indique au client de decharger une colonne de chunk de la memoire.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | chunkX | int32 LE | 4 | Coordonnee X de la colonne de chunk |
| 4 | chunkZ | int32 LE | 4 | Coordonnee Z de la colonne de chunk |

**Taille fixe :** 8 octets

#### ServerSetBlock (ID 140)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour un seul bloc dans le monde. Utilise pour la casse, le placement et les changements d'etat des blocs.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | x | int32 LE | 4 | Coordonnee X du bloc |
| 4 | y | int32 LE | 4 | Coordonnee Y du bloc |
| 8 | z | int32 LE | 4 | Coordonnee Z du bloc |
| 12 | blockId | int32 LE | 4 | Nouvel ID de type de bloc (0 = air) |
| 16 | filler | int16 LE | 2 | Donnees reservees/remplissage |
| 18 | rotation | octet | 1 | Etat de rotation du bloc (0-23) |

**Taille fixe :** 19 octets

#### ServerSetBlocks (ID 141)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Mise a jour groupee pour plusieurs blocs dans un chunk, plus efficace que plusieurs paquets ServerSetBlock.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | x | int32 LE | 4 | Coordonnee X du chunk |
| 4 | y | int32 LE | 4 | Coordonnee Y du chunk |
| 8 | z | int32 LE | 4 | Coordonnee Z du chunk |
| 12 | cmds | SetBlockCmd[] | Variable | Tableau de commandes de blocs |

**Structure SetBlockCmd (9 octets chacune) :**

| Champ | Type | Taille | Description |
|-------|------|--------|-------------|
| index | int16 LE | 2 | Index du bloc dans le chunk (0-4095) |
| blockId | int32 LE | 4 | ID du type de bloc |
| filler | int16 LE | 2 | Donnees reservees |
| rotation | octet | 1 | Rotation du bloc (0-23) |

**Taille maximale :** 36 864 017 octets

#### UpdateBlockDamage (ID 144)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour l'etat d'endommagement d'un bloc pendant la casse, utilise pour l'animation de casse.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateur de presence pour position |
| 1 | blockPosition | BlockPosition | 12 | Coordonnees du bloc cible |
| 13 | damage | float LE | 4 | Dommages totaux accumules (0.0-1.0) |
| 17 | delta | float LE | 4 | Changement de dommages ce tick |

**Taille fixe :** 21 octets

#### SetPaused (ID 158)

**Direction :** Bidirectionnel
**Compresse :** Non
**Description :** Met en pause ou reprend le jeu (solo uniquement).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | paused | octet | 1 | Booleen : etat de pause du jeu |

**Taille fixe :** 1 octet

---

### Paquets d'Inventaire

Les paquets d'inventaire gerent l'etat de l'inventaire du joueur, le deplacement d'objets et les interactions avec les conteneurs.

#### UpdatePlayerInventory (ID 170)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Synchronisation complete de l'inventaire, envoye a la connexion et apres des changements d'inventaire significatifs.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence pour 7 sections d'inventaire |
| 1 | sortType | octet | 1 | Enum SortType : Name, Type, Quality |
| 2 | storageOffset | int32 LE | 4 | Offset vers la section stockage |
| 6 | armorOffset | int32 LE | 4 | Offset vers la section armure |
| 10 | hotbarOffset | int32 LE | 4 | Offset vers la section barre d'acces rapide |
| 14 | utilityOffset | int32 LE | 4 | Offset vers la section utilitaires |
| 18 | builderMaterialOffset | int32 LE | 4 | Offset vers les materiaux de construction |
| 22 | toolsOffset | int32 LE | 4 | Offset vers la section outils |
| 26 | backpackOffset | int32 LE | 4 | Offset vers la section sac a dos |
| 30+ | sections | InventorySection[] | Variable | Donnees de section avec piles d'objets |

**Taille fixe :** 30 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

#### DropItemStack (ID 174)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Requete pour jeter des objets de l'inventaire dans le monde.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | inventorySectionId | int32 LE | 4 | ID de la section source |
| 4 | slotId | int32 LE | 4 | Index de l'emplacement source |
| 8 | quantity | int32 LE | 4 | Nombre d'objets a jeter |

**Taille fixe :** 12 octets

#### MoveItemStack (ID 175)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Requete pour deplacer des objets entre les emplacements ou sections d'inventaire.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | fromSectionId | int32 LE | 4 | ID de la section source |
| 4 | fromSlotId | int32 LE | 4 | Index de l'emplacement source |
| 8 | quantity | int32 LE | 4 | Nombre d'objets a deplacer |
| 12 | toSectionId | int32 LE | 4 | ID de la section destination |
| 16 | toSlotId | int32 LE | 4 | Index de l'emplacement destination |

**Taille fixe :** 20 octets

#### SetActiveSlot (ID 177)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Change la selection de l'emplacement actif de la barre d'acces rapide du joueur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | inventorySectionId | int32 LE | 4 | ID de la section (generalement barre d'acces rapide) |
| 4 | activeSlot | int32 LE | 4 | Nouvel index de l'emplacement actif |

**Taille fixe :** 8 octets

#### InventoryAction (ID 179)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Requete d'action d'inventaire generique (tout prendre, diviser pile, etc.).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | inventorySectionId | int32 LE | 4 | ID de la section cible |
| 4 | inventoryActionType | octet | 1 | Enum InventoryActionType |
| 5 | actionData | octet | 1 | Parametre specifique a l'action |

**Valeurs InventoryActionType :**
- `0` - TakeAll : Prendre la pile entiere
- `1` - Split : Diviser la pile en deux
- `2` - TakeOne : Prendre un seul objet

**Taille fixe :** 6 octets

---

### Paquets de Fenetre/Conteneur

Les paquets de fenetre gerent les conteneurs d'interface comme les coffres, les tables de craft et les boutiques.

#### OpenWindow (ID 200)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Ouvre une fenetre d'interface de conteneur sur le client.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | id | int32 LE | 4 | ID unique de la fenetre |
| 5 | windowType | octet | 1 | Enum WindowType |
| 6 | windowDataOffset | int32 LE | 4 | Offset vers la configuration de fenetre |
| 10 | inventoryOffset | int32 LE | 4 | Offset vers l'inventaire du conteneur |
| 14 | extraResourcesOffset | int32 LE | 4 | Offset vers les donnees supplementaires |

**Valeurs WindowType :**
- `0` - Container : Coffre/stockage generique
- `1` - Crafting : Table de craft
- `2` - Furnace : Interface de fusion
- `3` - Anvil : Reparation/nommage
- `4` - Enchanting : Table d'enchantement
- `5` - Trading : Boutique PNJ

**Taille maximale :** 1 677 721 600 octets

#### CloseWindow (ID 202)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Notifie le serveur que le joueur a ferme une fenetre.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | id | int32 LE | 4 | ID de la fenetre a fermer |

**Taille fixe :** 4 octets

#### SendWindowAction (ID 203)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Envoie une action specifique a la fenetre (crafter objet, trier, etc.).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | id | int32 LE | 4 | ID de la fenetre |
| 4 | action | WindowAction | Variable | Donnees d'action polymorphes |

**Types WindowAction :**
- CraftItemAction
- SelectSlotAction
- SortItemsAction
- TierUpgradeAction
- CraftRecipeAction
- ChangeBlockAction

**Taille maximale :** 32 768 027 octets

---

## Reference des Types de Donnees

### Types Primitifs

| Type | Taille | Description |
|------|--------|-------------|
| octet | 1 | Entier non signe 8 bits |
| int16 LE | 2 | Entier signe 16 bits little-endian |
| int32 LE | 4 | Entier signe 32 bits little-endian |
| int64 LE | 8 | Entier signe 64 bits little-endian |
| float LE | 4 | IEEE 754 32 bits little-endian |
| double LE | 8 | IEEE 754 64 bits little-endian |
| VarInt | 1-5 | Entier non signe a longueur variable |
| VarString | Variable | Longueur VarInt + octets UTF-8 |
| UUID | 16 | Deux valeurs int64 LE |

### Structures Communes

**Position (24 octets) :**
```
+------------------+------------------+------------------+
| x (double LE)    | y (double LE)    | z (double LE)    |
+------------------+------------------+------------------+
```

**BlockPosition (12 octets) :**
```
+------------------+------------------+------------------+
| x (int32 LE)     | y (int32 LE)     | z (int32 LE)     |
+------------------+------------------+------------------+
```

**Direction (12 octets) :**
```
+------------------+------------------+------------------+
| yaw (float LE)   | pitch (float LE) | roll (float LE)  |
+------------------+------------------+------------------+
```

**HalfFloatPosition (6 octets) :**
```
+------------------+------------------+------------------+
| x (half float)   | y (half float)   | z (half float)   |
+------------------+------------------+------------------+
```

**Vector3d (24 octets) :**
```
+------------------+------------------+------------------+
| x (double LE)    | y (double LE)    | z (double LE)    |
+------------------+------------------+------------------+
```

**Vector2f (8 octets) :**
```
+------------------+------------------+
| x (float LE)     | y (float LE)     |
+------------------+------------------+
```

---

## Reference des Fichiers Sources

| Composant | Fichier Source |
|-----------|----------------|
| Transport | `com/hypixel/hytale/server/core/io/transport/QUICTransport.java` |
| Base des Paquets | `com/hypixel/hytale/protocol/Packet.java` |
| Constantes du Protocole | `com/hypixel/hytale/protocol/ProtocolSettings.java` |
| IO des Paquets | `com/hypixel/hytale/protocol/io/PacketIO.java` |
| VarInt | `com/hypixel/hytale/protocol/io/VarInt.java` |
| Encodeur de Paquets | `com/hypixel/hytale/protocol/io/netty/PacketEncoder.java` |
| Gestionnaire Initial | `com/hypixel/hytale/server/core/io/handlers/InitialPacketHandler.java` |
| Gestionnaire de Jeu | `com/hypixel/hytale/server/core/io/handlers/game/GamePacketHandler.java` |
| Paquets d'Entite | `com/hypixel/hytale/protocol/packets/entities/*.java` |
| Paquets Joueur | `com/hypixel/hytale/protocol/packets/player/*.java` |
| Paquets de Monde | `com/hypixel/hytale/protocol/packets/world/*.java` |
| Paquets d'Inventaire | `com/hypixel/hytale/protocol/packets/inventory/*.java` |
| Paquets de Fenetre | `com/hypixel/hytale/protocol/packets/window/*.java` |
| Paquets Camera | `com/hypixel/hytale/protocol/packets/camera/*.java` |
| Paquets Machinima | `com/hypixel/hytale/protocol/packets/machinima/*.java` |
| Paquets Interface | `com/hypixel/hytale/protocol/packets/interface_/*.java` |

---

## Structures de Paquets Supplementaires

Cette section documente les categories de paquets supplementaires non couvertes dans la section principale ci-dessus.

### Paquets de Chat/Communication

Les paquets de chat gerent la communication textuelle entre les joueurs et le serveur.

#### ChatMessage (ID 211)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Envoie un message de chat du client au serveur. Utilise pour les entrees de chat des joueurs.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = message present |
| 1 | message | VarString | Variable | Contenu du message de chat (max 4 096 000 caracteres) |

**Taille fixe :** 1 octet (minimum)
**Taille maximale :** 16 384 006 octets

#### ServerMessage (ID 210)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Envoie un message formate du serveur au client. Utilise pour les messages systeme et le chat formate.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = message present |
| 1 | type | octet | 1 | Valeur enum ChatType |
| 2 | message | FormattedMessage | Variable | Contenu du message formate (optionnel) |

**Valeurs ChatType :**
- `0` - Chat : Message de chat standard

**Taille fixe :** 2 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

#### Notification (ID 212)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Affiche une notification popup au joueur. Prend en charge les messages primaires/secondaires, les icones et l'affichage d'objets.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence pour les champs optionnels |
| 1 | style | octet | 1 | Valeur enum NotificationStyle |
| 2 | messageOffset | int32 LE | 4 | Offset vers le message principal |
| 6 | secondaryMessageOffset | int32 LE | 4 | Offset vers le message secondaire |
| 10 | iconOffset | int32 LE | 4 | Offset vers la chaine d'icone |
| 14 | itemOffset | int32 LE | 4 | Offset vers les donnees de l'objet |
| 18+ | (Donnees variables) | Variable | Variable | Message, icone et donnees d'objet |

**Valeurs NotificationStyle :**
- `0` - Default : Notification standard
- `1` - Danger : Style rouge/alerte
- `2` - Warning : Style jaune/attention
- `3` - Success : Style vert/succes

**Taille fixe :** 18 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

#### KillFeedMessage (ID 213)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Affiche une entree dans le fil des eliminations montrant qui a tue qui, avec une icone optionnelle (arme/cause).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | killerOffset | int32 LE | 4 | Offset vers le message du tueur |
| 5 | decedentOffset | int32 LE | 4 | Offset vers le message du decede |
| 9 | iconOffset | int32 LE | 4 | Offset vers la chaine d'icone |
| 13+ | (Donnees variables) | Variable | Variable | Donnees du tueur, du decede et de l'icone |

**Taille fixe :** 13 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

#### ShowEventTitle (ID 214)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Affiche un titre/sous-titre en superposition sur l'ecran du joueur avec des animations de fondu configurables.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | fadeInDuration | float LE | 4 | Duree de l'animation d'apparition (secondes) |
| 5 | fadeOutDuration | float LE | 4 | Duree de l'animation de disparition (secondes) |
| 9 | duration | float LE | 4 | Duree d'affichage (secondes) |
| 13 | isMajor | octet | 1 | Booleen : style de titre large |
| 14 | iconOffset | int32 LE | 4 | Offset vers la chaine d'icone |
| 18 | primaryTitleOffset | int32 LE | 4 | Offset vers le titre principal |
| 22 | secondaryTitleOffset | int32 LE | 4 | Offset vers le titre secondaire |
| 26+ | (Donnees variables) | Variable | Variable | Contenu du titre |

**Taille fixe :** 26 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

#### HideEventTitle (ID 215)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Masque le titre d'evenement actuellement affiche avec une animation de fondu.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | fadeOutDuration | float LE | 4 | Duree de disparition en secondes |

**Taille fixe :** 4 octets

---

### Paquets Audio

Les paquets audio gerent la lecture audio sur le client.

#### PlaySoundEvent2D (ID 154)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Joue un son non positionnel (2D), typiquement pour les sons d'interface ou la musique qui doit etre jouee a un volume constant.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | soundEventIndex | int32 LE | 4 | ID de l'evenement sonore du registre d'assets |
| 4 | category | octet | 1 | Valeur enum SoundCategory |
| 5 | volumeModifier | float LE | 4 | Multiplicateur de volume (1.0 = normal) |
| 9 | pitchModifier | float LE | 4 | Multiplicateur de hauteur (1.0 = normal) |

**Valeurs SoundCategory :**
- `0` - Music : Musique de fond
- `1` - Ambient : Sons environnementaux
- `2` - SFX : Effets sonores
- `3` - UI : Sons d'interface

**Taille fixe :** 13 octets

#### PlaySoundEvent3D (ID 155)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Joue un son positionnel (3D) a un emplacement specifique du monde avec attenuation selon la distance.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = position presente |
| 1 | soundEventIndex | int32 LE | 4 | ID de l'evenement sonore |
| 5 | category | octet | 1 | Valeur enum SoundCategory |
| 6 | position | Position | 24 | Position dans le monde (x, y, z en doubles) |
| 30 | volumeModifier | float LE | 4 | Multiplicateur de volume |
| 34 | pitchModifier | float LE | 4 | Multiplicateur de hauteur |

**Taille fixe :** 38 octets

#### PlaySoundEventEntity (ID 156)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Joue un son attache a une entite, suivant la position de l'entite.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | soundEventIndex | int32 LE | 4 | ID de l'evenement sonore |
| 4 | networkId | int32 LE | 4 | ID reseau de l'entite pour attacher le son |
| 8 | volumeModifier | float LE | 4 | Multiplicateur de volume |
| 12 | pitchModifier | float LE | 4 | Multiplicateur de hauteur |

**Taille fixe :** 16 octets

---

### Paquets Meteo/Environnement

Les paquets meteo controlent les conditions environnementales et l'heure du jour.

#### UpdateWeather (ID 149)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Change l'etat meteo actuel avec une animation de transition.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | weatherIndex | int32 LE | 4 | ID du type de meteo du registre d'assets |
| 4 | transitionSeconds | float LE | 4 | Duree de la transition meteo |

**Taille fixe :** 8 octets

#### UpdateEditorWeatherOverride (ID 150)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Force un etat meteo specifique en mode editeur, contournant les transitions meteo normales.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | weatherIndex | int32 LE | 4 | ID du type de meteo a forcer |

**Taille fixe :** 4 octets

#### UpdateEnvironmentMusic (ID 151)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Change la musique ambiante en fonction de l'environnement/biome.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | environmentIndex | int32 LE | 4 | ID d'environnement pour la selection musicale |

**Taille fixe :** 4 octets

#### UpdateTime (ID 146)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Synchronise l'heure du jeu entre le serveur et le client.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = gameTime present |
| 1 | gameTime | InstantData | 12 | Donnees de l'heure actuelle du jeu |

**Taille fixe :** 13 octets

---

### Paquets Camera

Les paquets camera controlent la vue de la camera du joueur et les effets.

#### SetServerCamera (ID 280)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Definit le mode de vue de la camera du client et les parametres optionnels de camera personnalisee.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = cameraSettings present |
| 1 | clientCameraView | octet | 1 | Valeur enum ClientCameraView |
| 2 | isLocked | octet | 1 | Booleen : empecher le controle de la camera par le joueur |
| 3 | cameraSettings | ServerCameraSettings | 154 | Configuration de camera personnalisee (optionnel) |

**Valeurs ClientCameraView :**
- `0` - FirstPerson : Vue a la premiere personne
- `1` - ThirdPerson : Vue a la troisieme personne
- `2` - Custom : Vue personnalisee controlee par le serveur

**Taille fixe :** 157 octets

#### CameraShakeEffect (ID 281)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Applique un effet de tremblement de camera pour le retour d'impact, les explosions, etc.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | cameraShakeId | int32 LE | 4 | ID du preset de tremblement de camera |
| 4 | intensity | float LE | 4 | Multiplicateur d'intensite du tremblement |
| 8 | mode | octet | 1 | Valeur enum AccumulationMode |

**Valeurs AccumulationMode :**
- `0` - Set : Remplacer le tremblement actuel
- `1` - Sum : Ajouter au tremblement actuel
- `2` - Average : Melanger avec le tremblement actuel

**Taille fixe :** 9 octets

#### RequestFlyCameraMode (ID 282)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Le client demande a entrer ou sortir du mode camera libre (camera spectateur/cinematique).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | entering | octet | 1 | Booleen : entrer (true) ou sortir (false) du mode libre |

**Taille fixe :** 1 octet

#### SetFlyCameraMode (ID 283)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Reponse du serveur activant ou desactivant le mode camera libre.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | entering | octet | 1 | Booleen : etat d'entree en mode libre |

**Taille fixe :** 1 octet

---

### Paquets Machinima

Les paquets machinima prennent en charge les fonctionnalites d'enregistrement et de lecture cinematique.

#### RequestMachinimaActorModel (ID 260)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Le client demande les donnees du modele d'acteur pour une scene machinima.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | modelIdOffset | int32 LE | 4 | Offset vers la chaine d'ID du modele |
| 5 | sceneNameOffset | int32 LE | 4 | Offset vers la chaine du nom de scene |
| 9 | actorNameOffset | int32 LE | 4 | Offset vers la chaine du nom d'acteur |
| 13+ | (Donnees variables) | Variable | Variable | Donnees de chaines |

**Taille fixe :** 13 octets (minimum)
**Taille maximale :** 49 152 028 octets

#### SetMachinimaActorModel (ID 261)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Le serveur envoie les donnees du modele d'acteur pour le rendu machinima.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | modelOffset | int32 LE | 4 | Offset vers les donnees du modele |
| 5 | sceneNameOffset | int32 LE | 4 | Offset vers le nom de scene |
| 9 | actorNameOffset | int32 LE | 4 | Offset vers le nom d'acteur |
| 13+ | (Donnees variables) | Variable | Variable | Donnees du modele et des chaines |

**Taille fixe :** 13 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

#### UpdateMachinimaScene (ID 262)

**Direction :** Bidirectionnel
**Compresse :** Oui (Zstd)
**Description :** Met a jour l'etat de la scene machinima incluant le controle de lecture et les donnees de scene.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | frame | float LE | 4 | Image d'animation actuelle |
| 5 | updateType | octet | 1 | Valeur enum SceneUpdateType |
| 6 | playerOffset | int32 LE | 4 | Offset vers le nom du joueur |
| 10 | sceneNameOffset | int32 LE | 4 | Offset vers le nom de scene |
| 14 | sceneOffset | int32 LE | 4 | Offset vers les donnees de scene |
| 18+ | (Donnees variables) | Variable | Variable | Contenu de la scene |

**Valeurs SceneUpdateType :**
- `0` - Update : Mise a jour generale de la scene
- `1` - Play : Demarrer la lecture
- `2` - Stop : Arreter la lecture
- `3` - Frame : Aller a une image specifique
- `4` - Save : Sauvegarder les donnees de la scene

**Taille fixe :** 18 octets (minimum)
**Taille maximale :** 36 864 033 octets

---

### Paquets Effets/Particules

Les paquets d'effets gerent les effets visuels et le post-traitement.

#### SpawnParticleSystem (ID 152)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Fait apparaitre un systeme de particules a une position du monde avec couleur et echelle optionnelles.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence pour les champs optionnels |
| 1 | position | Position | 24 | Position dans le monde (optionnel) |
| 25 | rotation | Direction | 12 | Angles de rotation (optionnel) |
| 37 | scale | float LE | 4 | Multiplicateur d'echelle |
| 41 | color | Color | 3 | Teinte de couleur RGB (optionnel) |
| 44 | particleSystemId | VarString | Variable | Chaine d'ID du systeme de particules |

**Taille fixe :** 44 octets (minimum)
**Taille maximale :** 16 384 049 octets

#### SpawnBlockParticleSystem (ID 153)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Fait apparaitre des effets de particules bases sur les blocs (casse, marche, etc.).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = position presente |
| 1 | blockId | int32 LE | 4 | ID du type de bloc pour la texture |
| 5 | particleType | octet | 1 | Enum BlockParticleEvent (Walk, Break, etc.) |
| 6 | position | Position | 24 | Position dans le monde (optionnel) |

**Taille fixe :** 30 octets

#### UpdatePostFxSettings (ID 361)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour les parametres des effets visuels de post-traitement.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | globalIntensity | float LE | 4 | Intensite globale de l'effet |
| 4 | power | float LE | 4 | Puissance/force de l'effet |
| 8 | sunshaftScale | float LE | 4 | Echelle des rayons de soleil |
| 12 | sunIntensity | float LE | 4 | Luminosite du soleil |
| 16 | sunshaftIntensity | float LE | 4 | Intensite de l'effet des rayons de soleil |

**Taille fixe :** 20 octets

---

### Paquets de Fenetre (Etendus)

#### UpdateWindow (ID 201)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Met a jour le contenu d'une fenetre ouverte sans la fermer et la rouvrir.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | id | int32 LE | 4 | ID de la fenetre a mettre a jour |
| 5 | windowDataOffset | int32 LE | 4 | Offset vers les donnees JSON de la fenetre |
| 9 | inventoryOffset | int32 LE | 4 | Offset vers la section d'inventaire |
| 13 | extraResourcesOffset | int32 LE | 4 | Offset vers les ressources supplementaires |
| 17+ | (Donnees variables) | Variable | Variable | Contenu de la fenetre |

**Taille fixe :** 17 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

#### ClientOpenWindow (ID 204)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Le client demande a ouvrir une fenetre d'un type specifique.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | type | octet | 1 | Valeur enum WindowType |

**Valeurs WindowType :**
- `0` - Container : Conteneur de stockage generique
- `1` - PocketCrafting : Grille de craft d'inventaire
- `2` - BasicCrafting : Table de craft basique
- `3` - DiagramCrafting : Craft base sur les recettes
- `4` - StructuralCrafting : Craft de construction/structure
- `5` - Processing : Interface de fourneau/traitement
- `6` - Memories : Interface de memoire/journal

**Taille fixe :** 1 octet

---

### Paquets de Craft

Les paquets de craft gerent la gestion des recettes et les operations de fabrication.

#### CraftItemAction (Action de Fenetre)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Demande de fabrication d'un objet en utilisant l'interface de craft actuelle. Envoye comme WindowAction dans le paquet SendWindowAction.

| Champ | Type | Taille | Description |
|-------|------|--------|-------------|
| craftCount | int32 LE | 4 | Nombre d'objets a fabriquer |

**Taille fixe :** 4 octets

#### CraftRecipeAction (Action de Fenetre)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Demande de fabrication d'une recette specifique par ID. Utilise avec la fonctionnalite du livre de recettes.

| Champ | Type | Taille | Description |
|-------|------|--------|-------------|
| recipeIdOffset | int32 LE | 4 | Offset vers la chaine d'ID de recette |
| craftCount | int32 LE | 4 | Nombre de fois a fabriquer |
| recipeId | VarString | Variable | Chaine d'identifiant de recette |

**Taille fixe :** 8 octets (minimum)
**Taille maximale :** 16 384 012 octets

#### CancelCraftingAction (Action de Fenetre)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Annule une operation de craft en cours.

| Champ | Type | Taille | Description |
|-------|------|--------|-------------|
| (aucun champ) | - | 0 | Action vide |

**Taille fixe :** 0 octets

#### UpdateRecipes (Paquet d'Assets)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Envoie le registre complet des recettes au client pendant la phase de configuration.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = recettes presentes |
| 1 | recipes | RecipeData[] | Variable | Tableau de definitions de recettes |

**Taille maximale :** 1 677 721 600 octets

#### UpdateKnownRecipes (ID 221)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour la liste des recettes debloquees/connues du client.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = recettes presentes |
| 1 | recipes | String[] | Variable | Tableau d'IDs de recettes connues |

**Taille maximale :** 1 677 721 600 octets

---

### Paquets de Monture/PNJ

Les paquets de monture et PNJ gerent les mecaniques de chevauchement et les interactions avec les PNJ.

#### MountNPC (ID 192)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Demande de monter une entite PNJ (creature chevauchable, vehicule).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | networkId | int32 LE | 4 | ID reseau de l'entite a monter |

**Taille fixe :** 4 octets

#### DismountNPC (ID 193)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Demande de descendre de l'entite actuellement montee.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| (aucun champ) | - | 0 | Paquet vide |

**Taille fixe :** 0 octets

#### SyncInteractionChain (ID 290)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Synchronise l'etat d'une chaine d'interaction avec le serveur. Utilise pour les dialogues PNJ complexes ou les interactions en plusieurs etapes.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | interactionChainId | int32 LE | 4 | Identifiant de la chaine d'interaction |
| 5 | stringOffset | int32 LE | 4 | Offset vers les donnees de chaine |
| 9+ | (Donnees variables) | Variable | Variable | Donnees de la chaine d'interaction |

**Taille fixe :** 9 octets (minimum)
**Taille maximale :** 16 384 013 octets

---

### Paquets d'Acces Serveur/Permissions

Les paquets d'acces serveur controlent les permissions des joueurs et l'accessibilite du serveur dans les mondes solo.

#### UpdateServerAccess (ID 251)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Notifie le client des parametres d'acces serveur mis a jour. Utilise quand l'hote change l'acces LAN/amis.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | access | octet | 1 | Valeur enum Access |

**Valeurs Access :**
- `0` - Private : Pas d'acces externe
- `1` - LAN : Acces reseau local uniquement
- `2` - Friend : Les amis peuvent rejoindre
- `3` - Open : N'importe qui peut rejoindre

**Taille fixe :** 1 octet

#### SetServerAccess (ID 252)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Demande du client pour changer le niveau d'acces du serveur (hote uniquement).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | access | octet | 1 | Valeur enum Access desiree |

**Taille fixe :** 1 octet

---

### Paquets de Chargement d'Assets

Les paquets d'assets gerent le transfert et la synchronisation des assets de jeu pendant la configuration de connexion.

#### AssetInitialize (ID 21)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Initie le transfert d'assets, fournissant des metadonnees sur les assets a envoyer.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | totalParts | int32 LE | 4 | Nombre total de parties d'assets |
| 5 | totalSize | int64 LE | 8 | Taille totale de tous les assets en octets |
| 13 | hashOffset | int32 LE | 4 | Offset vers la chaine de hachage d'asset |
| 17+ | hash | VarString | Variable | Hachage du bundle d'assets pour mise en cache |

**Taille fixe :** 17 octets (minimum)
**Taille maximale :** 16 384 021 octets

#### AssetPart (ID 22)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Transfere un morceau de donnees d'asset. Les gros assets sont divises en plusieurs parties.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = donnees presentes |
| 1 | partIndex | int32 LE | 4 | Index de cette partie (base 0) |
| 5 | data | byte[] | Variable | Morceau de donnees d'asset |

**Taille maximale :** 1 677 721 600 octets

#### AssetFinalize (ID 24)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Signale la fin du transfert d'assets, permettant au client de finaliser le chargement.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| (aucun champ) | - | 0 | Paquet vide |

**Taille fixe :** 0 octets

#### RequestAssets (ID 23)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Le client demande les donnees d'assets au serveur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = hachage present |
| 1 | hash | VarString | Variable | Hachage d'asset en cache du client (pour mises a jour delta) |

**Taille fixe :** 1 octet (minimum)
**Taille maximale :** 16 384 006 octets

---

### Paquets de Configuration du Monde

Les paquets de configuration du monde configurent les parametres du monde pendant la phase de configuration.

#### WorldSettings (ID 20)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Envoie la configuration du monde incluant la hauteur et les assets requis.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = requiredAssets present |
| 1 | worldHeight | int32 LE | 4 | Hauteur maximale du monde en blocs |
| 5 | requiredAssets | Asset[] | Variable | Tableau de definitions d'assets requis |

**Taille fixe :** 5 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

#### ServerTags (ID 34)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Envoie les tags definis par le serveur utilises pour les mecaniques de jeu et le filtrage.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = tags presents |
| 1 | tags | `Map<String, int32>` | Variable | Dictionnaire de noms de tags vers IDs |

**Taille maximale :** 1 677 721 600 octets

---

### Paquets de Fluides/Generation du Monde

Les paquets de fluides et generation du monde gerent les caracteristiques du terrain comme l'eau et la lave.

#### SetFluids (ID 136)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Definit les donnees de fluides pour une section de chunk.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = donnees presentes |
| 1 | x | int32 LE | 4 | Coordonnee X du chunk |
| 5 | y | int32 LE | 4 | Coordonnee Y du chunk |
| 9 | z | int32 LE | 4 | Coordonnee Z du chunk |
| 13 | data | byte[] | Variable | Donnees de niveau de fluide compressees (max 4 096 000 octets) |

**Taille fixe :** 13 octets (minimum)
**Taille maximale :** 4 096 018 octets

---

### Paquets de Sommeil/Temps

Les paquets de sommeil gerent les mecaniques de sommeil multijoueur pour la progression du temps.

#### UpdateSleepState (ID 157)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour l'interface de sommeil du client et synchronise la progression du sommeil.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = horloge presente, bit 1 = multijoueur present |
| 1 | grayFade | octet | 1 | Booleen : activer le fondu gris de l'ecran |
| 2 | sleepUi | octet | 1 | Booleen : afficher l'interface de sommeil |
| 3 | clock | SleepClock | 33 | Donnees de l'horloge de sommeil (optionnel) |
| 36 | multiplayer | SleepMultiplayer | Variable | Info sommeil multijoueur (optionnel) |

**Structure SleepClock (33 octets) :**

| Champ | Type | Taille | Description |
|-------|------|--------|-------------|
| startGametime | InstantData | 12 | Heure de jeu au debut du sommeil (optionnel) |
| targetGametime | InstantData | 12 | Heure de reveil cible (optionnel) |
| progress | float LE | 4 | Progression du sommeil (0.0-1.0) |
| durationSeconds | float LE | 4 | Duree du sommeil en secondes |

**Taille fixe :** 36 octets (minimum)
**Taille maximale :** 65 536 050 octets

---

### Paquets d'Interface Personnalisee

Les paquets d'interface personnalisee permettent aux serveurs de creer des interfaces dynamiques.

#### CustomHud (ID 217)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Met a jour la superposition HUD personnalisee avec des elements d'interface definis par le serveur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = commandes presentes |
| 1 | clear | octet | 1 | Booleen : effacer les elements HUD existants |
| 2 | commands | CustomUICommand[] | Variable | Tableau de commandes d'interface |

**Taille maximale :** 1 677 721 600 octets

#### CustomPage (ID 218)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Ouvre ou met a jour une page/ecran d'interface personnalisee.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence |
| 1 | isInitial | octet | 1 | Booleen : chargement initial de la page |
| 2 | clear | octet | 1 | Booleen : effacer le contenu existant |
| 3 | lifetime | octet | 1 | Enum CustomPageLifetime |
| 4 | keyOffset | int32 LE | 4 | Offset vers la chaine de cle de page |
| 8 | commandsOffset | int32 LE | 4 | Offset vers le tableau de commandes |
| 12 | eventBindingsOffset | int32 LE | 4 | Offset vers les liaisons d'evenements |
| 16+ | (Donnees variables) | Variable | Variable | Contenu de la page |

**Valeurs CustomPageLifetime :**
- `0` - CantClose : La page ne peut pas etre fermee par l'utilisateur
- `1` - CanClose : L'utilisateur peut fermer la page
- `2` - AutoClose : La page se ferme automatiquement

**Taille fixe :** 16 octets (minimum)
**Taille maximale :** 1 677 721 600 octets

---

### Paquets de Portail

Les paquets de portail gerent les transitions de dimension/monde.

#### UpdatePortal (ID 229)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour l'etat et la definition du portail pour les transitions de dimension.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = etat present, bit 1 = definition presente |
| 1 | state | PortalState | 5 | Etat actuel du portail (optionnel) |
| 6 | definition | PortalDef | Variable | Donnees de definition du portail (optionnel) |

**Taille fixe :** 6 octets (minimum)
**Taille maximale :** 16 384 020 octets

---

### Paquets de Liste de Joueurs

Les paquets de liste de joueurs gerent l'affichage de la liste des joueurs du serveur.

#### UpdateServerPlayerList (ID 226)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour la liste des joueurs affichee dans le menu pause/tab.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = joueurs presents |
| 1 | players | ServerPlayerListUpdate[] | Variable | Tableau de mises a jour de joueurs |

**Structure ServerPlayerListUpdate (32 octets chacune) :**

| Champ | Type | Taille | Description |
|-------|------|--------|-------------|
| uuid | UUID | 16 | UUID du joueur |
| username | VarString | Variable | Nom d'affichage du joueur |
| action | octet | 1 | Ajouter, Supprimer ou Mettre a jour |

**Taille maximale :** 131 072 006 octets

---

### Paquets du Mode Creatif

Les paquets du mode creatif gerent les operations d'inventaire en mode creatif.

#### SetCreativeItem (ID 171)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Definit un objet dans l'inventaire du mode creatif, permettant de faire apparaitre n'importe quel objet.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | inventorySectionId | int32 LE | 4 | Section d'inventaire cible |
| 4 | slotId | int32 LE | 4 | Index de l'emplacement cible |
| 8 | override | octet | 1 | Booleen : remplacer l'objet existant |
| 9 | item | ItemQuantity | Variable | Donnees de l'objet a definir |

**Taille fixe :** 9 octets (minimum)
**Taille maximale :** 16 384 019 octets

#### SmartMoveItemStack (ID 176)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Deplacement intelligent d'objet qui trouve automatiquement le meilleur emplacement de destination.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | fromSectionId | int32 LE | 4 | ID de la section source |
| 4 | fromSlotId | int32 LE | 4 | Index de l'emplacement source |
| 8 | quantity | int32 LE | 4 | Nombre d'objets a deplacer |
| 12 | moveType | octet | 1 | Valeur enum SmartMoveType |

**Valeurs SmartMoveType :**
- `0` - EquipOrMergeStack : Equiper l'objet ou fusionner avec une pile existante

**Taille fixe :** 13 octets

---

### Paquets d'Effets/Statuts

Les paquets d'effets gerent les effets de statut d'entite et les buffs/debuffs.

#### UpdateEntityEffects (Paquet d'Assets)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Envoie le registre de definitions d'effets pendant la configuration.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = effets presents |
| 1 | effects | EffectData[] | Variable | Tableau de definitions d'effets |

**Taille maximale :** 1 677 721 600 octets

---

## Administration du Serveur

Cette section documente l'administration du serveur, la moderation des joueurs et la gestion des permissions. Contrairement a la plupart des fonctionnalites de jeu, le systeme d'administration de Hytale est principalement **base sur les commandes** plutot que sur les paquets. Les actions administratives sont executees via des commandes console ou chat, qui utilisent ensuite les paquets reseau existants pour l'application.

### Apercu de l'Architecture

```
+-------------------+     +-------------------+     +-------------------+
| Commandes         | --> | Gestionnaire de   | --> | Paquets Reseau    |
| Console/Chat      |     | Commandes         |     | (Application)     |
+-------------------+     +-------------------+     +-------------------+
        |                         |                         |
   /kick joueur             KickCommand.java           Disconnect (ID 1)
   /ban joueur              BanCommand.java            Disconnect (ID 1)
   /op add joueur           OpAddCommand.java          (Changement perm.)
   /whitelist add           WhitelistAddCommand.java   (Verification acces)
```

### Systeme de Console

La console serveur fournit un acces administratif direct sans authentification. Les commandes console sont traitees par `ConsoleModule` (`com.hypixel.hytale.server.core.console.ConsoleModule`).

**Caracteristiques Principales :**
- L'expediteur console (`ConsoleSender`) a **toutes les permissions** par defaut
- Utilise la bibliotheque JLine pour la gestion du terminal
- Supporte les terminaux simples et couleur
- Les commandes peuvent etre prefixees par `/` mais c'est optionnel

**Source :** `com/hypixel/hytale/server/core/console/ConsoleModule.java`

```java
// L'expediteur console retourne toujours true pour les verifications de permission
@Override
public boolean hasPermission(@Nonnull String id) {
    return true;
}
```

### Commandes de Moderation des Joueurs

#### Commande Kick

**Commande :** `/kick <joueur>`
**Permission :** `hytale.command.kick`
**Description :** Deconnecte immediatement un joueur du serveur.

**Implementation :** Utilise le paquet `Disconnect` (ID 1) avec la raison "You were kicked."

| Champ | Valeur |
|-------|--------|
| reason | "You were kicked." |
| type | DisconnectType.Disconnect (0) |

**Source :** `com/hypixel/hytale/server/core/command/commands/server/KickCommand.java`

#### Commande Ban

**Commande :** `/ban <nom_utilisateur> [raison]`
**Permission :** `hytale.command.ban`
**Disponibilite :** Multijoueur uniquement (indisponible en solo)
**Description :** Bannit definitivement un joueur du serveur.

**Types de Bannissement :**

| Type | Classe | Description |
|------|--------|-------------|
| `infinite` | `InfiniteBan` | Bannissement permanent sans expiration |
| `timed` | `TimedBan` | Bannissement temporaire avec horodatage d'expiration |

**Structure de Donnees de Bannissement (JSON) :**

```json
{
  "type": "infinite",
  "target": "uuid-joueur",
  "by": "uuid-admin",
  "timestamp": 1234567890000,
  "reason": "Violation des regles du serveur"
}
```

**Champ Supplementaire TimedBan :**

```json
{
  "expiresOn": 1234567890000
}
```

**Format du Message de Deconnexion :**
- Infini : `"You are permanently banned! Reason: <raison>"`
- Temporaire : `"You are temporarily banned for <duree>! Reason: <raison>"`

**Source :** `com/hypixel/hytale/server/core/modules/accesscontrol/commands/BanCommand.java`

#### Commande Unban

**Commande :** `/unban <nom_utilisateur>`
**Permission :** `hytale.command.unban`
**Disponibilite :** Multijoueur uniquement
**Description :** Supprime un bannissement d'un joueur.

**Source :** `com/hypixel/hytale/server/core/modules/accesscontrol/commands/UnbanCommand.java`

### Commandes Whitelist

Le systeme de liste blanche controle l'acces au serveur avant l'authentification.

**Commande :** `/whitelist <sous-commande>`
**Permission :** `hytale.command.whitelist.*`

| Sous-commande | Description |
|---------------|-------------|
| `add <nom_utilisateur>` | Ajouter un joueur a la liste blanche |
| `remove <nom_utilisateur>` | Retirer un joueur de la liste blanche |
| `enable` | Activer l'application de la liste blanche |
| `disable` | Desactiver l'application de la liste blanche |
| `status` | Afficher le statut de la liste blanche |
| `list` | Lister les joueurs en liste blanche |
| `clear` | Retirer tous les joueurs de la liste blanche |

**Flux de Verification d'Acces :**

```
Connexion Joueur --> AccessControlModule --> WhitelistProvider --> Autoriser/Refuser
                                         --> BanProvider --------> Autoriser/Refuser
```

**Source :** `com/hypixel/hytale/server/core/modules/accesscontrol/AccessControlModule.java`

### Systeme de Permissions

Hytale implemente un systeme de permissions hierarchique avec support des jokers et de la negation.

#### Format des Permissions

| Motif | Description |
|-------|-------------|
| `hytale.command.kick` | Permission specifique |
| `hytale.command.*` | Joker (toutes les permissions de commande) |
| `*` | Toutes les permissions |
| `-hytale.command.ban` | Permission niee (explicitement refusee) |
| `-*` | Refuser toutes les permissions |

#### Noeuds de Permission par Defaut

| Permission | Description |
|------------|-------------|
| `hytale.command` | Permission de base pour toutes les commandes |
| `hytale.command.<nom>` | Permission pour une commande specifique |
| `hytale.editor.asset` | Acces a l'editeur d'assets |
| `hytale.editor.builderTools` | Acces aux outils de construction |
| `hytale.editor.brush.use` | Utilisation de l'outil pinceau |
| `hytale.editor.brush.config` | Configuration du pinceau |
| `hytale.editor.prefab.use` | Placement de prefabs |
| `hytale.editor.prefab.manage` | Gestion des prefabs |
| `hytale.editor.selection.use` | Utilisation de l'outil de selection |
| `hytale.editor.selection.clipboard` | Operations de presse-papiers |
| `hytale.editor.selection.modify` | Modification de selection |
| `hytale.editor.history` | Historique annuler/refaire |
| `hytale.camera.flycam` | Mode camera libre |

**Source :** `com/hypixel/hytale/server/core/permissions/HytalePermissions.java`

#### Commandes Operateur

**Commande :** `/op <sous-commande>`
**Description :** Gere le statut operateur (admin) des joueurs.

| Sous-commande | Permission | Description |
|---------------|------------|-------------|
| `self` | (console uniquement) | Accorder OP a l'expediteur de commande |
| `add <joueur>` | `hytale.command.op.add` | Accorder le statut OP a un joueur |
| `remove <joueur>` | `hytale.command.op.remove` | Revoquer le statut OP d'un joueur |

**Groupe OP :** Les joueurs auxquels le statut OP est accorde sont ajoutes au groupe de permission `"OP"`.

**Source :** `com/hypixel/hytale/server/core/permissions/commands/op/OpCommand.java`

#### Commandes de Gestion des Permissions

**Commande :** `/perm <sous-commande>`
**Description :** Manipulation directe des permissions.

**Sous-commandes Utilisateur :**

| Commande | Description |
|----------|-------------|
| `/perm user list <uuid>` | Lister les permissions de l'utilisateur |
| `/perm user add <uuid> <permissions...>` | Ajouter des permissions a l'utilisateur |
| `/perm user remove <uuid> <permissions...>` | Retirer des permissions de l'utilisateur |
| `/perm user group list <uuid>` | Lister les groupes de l'utilisateur |
| `/perm user group add <uuid> <groupe>` | Ajouter l'utilisateur a un groupe |
| `/perm user group remove <uuid> <groupe>` | Retirer l'utilisateur d'un groupe |

**Sous-commandes Groupe :**

| Commande | Description |
|----------|-------------|
| `/perm group list <groupe>` | Lister les permissions du groupe |
| `/perm group add <groupe> <permissions...>` | Ajouter des permissions au groupe |
| `/perm group remove <groupe> <permissions...>` | Retirer des permissions du groupe |

**Source :** `com/hypixel/hytale/server/core/permissions/commands/PermCommand.java`

### Controle d'Acces Serveur (Solo)

Pour les mondes solo ouverts en LAN ou aux amis, l'acces est controle via les paquets `ServerAccess`.

#### UpdateServerAccess (ID 251)

**Direction :** Serveur -> Client
**Description :** Notifie les clients des changements de niveau d'acces au serveur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | access | octet | 1 | Valeur enum Access |

**Valeurs Access :**

| Valeur | Nom | Description |
|--------|-----|-------------|
| 0 | Private | Pas d'acces externe (solo uniquement) |
| 1 | LAN | Les joueurs du reseau local peuvent rejoindre |
| 2 | Friend | Les amis peuvent rejoindre via invitation |
| 3 | Open | N'importe qui peut rejoindre |

**Taille fixe :** 1 octet

#### SetServerAccess (ID 252)

**Direction :** Client -> Serveur
**Description :** L'hote demande a changer le niveau d'acces du serveur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | access | octet | 1 | Valeur enum Access desiree |

**Taille fixe :** 1 octet

### Commande de Diffusion

**Commande :** `/say <message>` ou `/broadcast <message>`
**Permission :** `hytale.command.say`
**Description :** Envoie un message a tous les joueurs du serveur.

**Format du Message :** Utilise le paquet `ServerMessage` (ID 210) avec un style de couleur cyan.

**Source :** `com/hypixel/hytale/server/core/console/command/SayCommand.java`

### Commandes de Configuration du Monde

**Commande :** `/world config <sous-commande>`
**Description :** Gere les parametres specifiques au monde.

| Sous-commande | Description |
|---------------|-------------|
| `pausetime` | Basculer la progression du temps |
| `seed` | Afficher la graine du monde |
| `setpvp <active>` | Activer/desactiver le PvP |
| `setspawn` | Definir le point d'apparition du monde |

**Source :** `com/hypixel/hytale/server/core/universe/world/commands/worldconfig/WorldConfigCommand.java`

### Module de Controle d'Acces

Le `AccessControlModule` gere a la fois les bannissements et la liste blanche via un systeme de fournisseurs.

**Registre des Fournisseurs :**
1. `HytaleWhitelistProvider` - Gere les entrees de liste blanche
2. `HytaleBanProvider` - Gere les entrees de bannissement

**Flux de Verification de Connexion :**

```
PlayerSetupConnectEvent
    |
    v
AccessControlModule.getDisconnectReason(uuid)
    |
    +---> WhitelistProvider.getDisconnectReason(uuid)
    |         |
    |         +---> Si liste blanche activee et joueur non en liste :
    |                   Retourner "You are not whitelisted!"
    |
    +---> BanProvider.getDisconnectReason(uuid)
              |
              +---> Si joueur banni et bannissement en vigueur :
                        Retourner message de bannissement
    |
    v
Si raison retournee : Annuler connexion, envoyer paquet Disconnect
```

**Source :** `com/hypixel/hytale/server/core/modules/accesscontrol/AccessControlModule.java`

### Paquets Reseau Associes

| Paquet | ID | Utilisation en Administration |
|--------|-----|-------------------------------|
| Disconnect | 1 | Applique kick/ban en terminant la connexion |
| ServerMessage | 210 | Diffuse les messages admin aux joueurs |
| UpdateServerAccess | 251 | Notifie les changements de niveau d'acces |
| SetServerAccess | 252 | Demande les changements de niveau d'acces |
| UpdateServerPlayerList | 226 | Met a jour la liste des joueurs apres kick/ban |

### RCON (Console Distante)

Dans la version analysee, Hytale n'implemente pas de protocole RCON traditionnel. L'administration du serveur s'effectue via :

1. **Console Locale** - Acces terminal direct au processus serveur
2. **Commandes en Jeu** - Commandes chat avec les permissions appropriees
3. **API Plugin** - Acces programmatique pour les plugins serveur

**Note :** Les versions futures pourraient implementer RCON ou des protocoles d'administration distante similaires.

---

## Reference des Fichiers Sources d'Administration

| Composant | Fichier Source |
|-----------|----------------|
| Module Console | `com/hypixel/hytale/server/core/console/ConsoleModule.java` |
| Expediteur Console | `com/hypixel/hytale/server/core/console/ConsoleSender.java` |
| Controle d'Acces | `com/hypixel/hytale/server/core/modules/accesscontrol/AccessControlModule.java` |
| Fournisseur de Bannissement | `com/hypixel/hytale/server/core/modules/accesscontrol/provider/HytaleBanProvider.java` |
| Fournisseur de Liste Blanche | `com/hypixel/hytale/server/core/modules/accesscontrol/provider/HytaleWhitelistProvider.java` |
| Commande Ban | `com/hypixel/hytale/server/core/modules/accesscontrol/commands/BanCommand.java` |
| Commande Unban | `com/hypixel/hytale/server/core/modules/accesscontrol/commands/UnbanCommand.java` |
| Commande Kick | `com/hypixel/hytale/server/core/command/commands/server/KickCommand.java` |
| Commandes Whitelist | `com/hypixel/hytale/server/core/modules/accesscontrol/commands/WhitelistCommand.java` |
| Module Permissions | `com/hypixel/hytale/server/core/permissions/PermissionsModule.java` |
| Constantes Permission | `com/hypixel/hytale/server/core/permissions/HytalePermissions.java` |
| Commandes OP | `com/hypixel/hytale/server/core/permissions/commands/op/OpCommand.java` |
| Commandes Permission | `com/hypixel/hytale/server/core/permissions/commands/PermCommand.java` |
| Commande Say | `com/hypixel/hytale/server/core/console/command/SayCommand.java` |
| Config Monde | `com/hypixel/hytale/server/core/universe/world/commands/worldconfig/WorldConfigCommand.java` |

---

## Paquets de Monde Supplementaires

Cette section documente les paquets lies au monde pour la gestion du terrain, des biomes et de l'environnement.

### SetChunkHeightmap (ID 132)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Envoie les donnees de heightmap pour une colonne de chunk. Utilise pour l'optimisation du rendu, le culling d'occlusion et le calcul des ombres.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = heightmap present |
| 1 | x | int32 LE | 4 | Coordonnee X de la colonne de chunk |
| 5 | z | int32 LE | 4 | Coordonnee Z de la colonne de chunk |
| 9 | heightmap | VarInt + byte[] | Variable | Donnees de heightmap (max 4 096 000 octets) |

**Taille fixe :** 9 octets (minimum)
**Taille maximale :** 4 096 014 octets

---

### SetChunkTintmap (ID 133)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Envoie les donnees de tintmap pour la teinte des couleurs basee sur le biome de l'herbe, des feuilles et de l'eau dans une colonne de chunk.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = tintmap present |
| 1 | x | int32 LE | 4 | Coordonnee X de la colonne de chunk |
| 5 | z | int32 LE | 4 | Coordonnee Z de la colonne de chunk |
| 9 | tintmap | VarInt + byte[] | Variable | Donnees de couleur de teinte (max 4 096 000 octets) |

**Taille fixe :** 9 octets (minimum)
**Taille maximale :** 4 096 014 octets

---

### SetChunkEnvironments (ID 134)

**Direction :** Serveur -> Client
**Compresse :** Oui (Zstd)
**Description :** Envoie les donnees de zone d'environnement pour une colonne de chunk. Definit quel environnement (biome/zone) s'applique a chaque zone, affectant les sons ambiants, la musique et les transitions meteorologiques.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = environments present |
| 1 | x | int32 LE | 4 | Coordonnee X de la colonne de chunk |
| 5 | z | int32 LE | 4 | Coordonnee Z de la colonne de chunk |
| 9 | environments | VarInt + byte[] | Variable | Indices de zone d'environnement (max 4 096 000 octets) |

**Taille fixe :** 9 octets (minimum)
**Taille maximale :** 4 096 014 octets

---

### ServerSetFluid (ID 142)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour un seul bloc de fluide a une position specifique. Utilise pour les mises a jour d'ecoulement d'eau/lave, les interactions de seau et la physique des fluides.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | x | int32 LE | 4 | Coordonnee X du bloc |
| 4 | y | int32 LE | 4 | Coordonnee Y du bloc |
| 8 | z | int32 LE | 4 | Coordonnee Z du bloc |
| 12 | fluidId | int32 LE | 4 | ID du type de fluide (0 = aucun, 1 = eau, 2 = lave, etc.) |
| 16 | fluidLevel | octet | 1 | Niveau de fluide (0-15, 0 = vide, 15 = source) |

**Taille fixe :** 17 octets

---

### ServerSetFluids (ID 143)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Mise a jour groupee pour plusieurs blocs de fluide dans un chunk. Plus efficace que plusieurs paquets ServerSetFluid.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | x | int32 LE | 4 | Coordonnee X du chunk |
| 4 | y | int32 LE | 4 | Coordonnee Y du chunk |
| 8 | z | int32 LE | 4 | Coordonnee Z du chunk |
| 12 | cmds | VarInt + SetFluidCmd[] | Variable | Tableau de commandes de mise a jour de fluide |

**Structure SetFluidCmd (7 octets chacune) :**

| Champ | Type | Taille | Description |
|-------|------|--------|-------------|
| index | int16 LE | 2 | Index du bloc dans le chunk (0-4095) |
| fluidId | int32 LE | 4 | ID du type de fluide |
| fluidLevel | octet | 1 | Niveau de fluide (0-15) |

**Taille fixe :** 12 octets (minimum)
**Taille maximale :** 28 672 017 octets

---

### UpdateTimeSettings (ID 145)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour la configuration temporelle du monde, y compris les durees du cycle jour/nuit et les phases lunaires.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | daytimeDurationSeconds | int32 LE | 4 | Duree du jour en secondes |
| 4 | nighttimeDurationSeconds | int32 LE | 4 | Duree de la nuit en secondes |
| 8 | totalMoonPhases | octet | 1 | Nombre de phases lunaires dans le cycle |
| 9 | timePaused | octet | 1 | Booleen : progression du temps en pause |

**Taille fixe :** 10 octets

---

### UpdateEditorTimeOverride (ID 147)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Force un temps specifique en mode editeur, contournant la progression normale du temps. Utilise pour tester l'eclairage et le contenu sensible au temps.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = gameTime present |
| 1 | gameTime | InstantData | 12 | Temps de jeu cible (optionnel) |
| 13 | paused | octet | 1 | Booleen : progression du temps en pause |

**Taille fixe :** 14 octets

---

### ClearEditorTimeOverride (ID 148)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Efface tout override de temps de l'editeur, reprenant la progression normale du temps.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| (aucun champ) | - | 0 | Paquet vide |

**Taille fixe :** 0 octet

---

### ServerSetPaused (ID 159)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Etat de pause autoritaire du serveur. Contrairement au SetPaused bidirectionnel (ID 158), ceci est une notification serveur uniquement des changements d'etat de pause.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | paused | octet | 1 | Booleen : etat du jeu en pause |

**Taille fixe :** 1 octet

---

### UpdateSunSettings (ID 360)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour la position et l'angle du soleil pour des scenarios d'eclairage personnalises, cinematiques ou eclairage specifique a une zone.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | heightPercentage | float LE | 4 | Hauteur du soleil (0.0 = horizon, 1.0 = zenith) |
| 4 | angleRadians | float LE | 4 | Angle de rotation du soleil en radians |

**Taille fixe :** 8 octets

---

## Paquets Joueur Supplementaires

Cette section documente les paquets lies au joueur pour les statistiques, capacites et gestion d'etat.

### SetClientId (ID 100)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Attribue un identifiant client unique au joueur. Envoye pendant la configuration de connexion.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | clientId | int32 LE | 4 | Identifiant unique de session client |

**Taille fixe :** 4 octets

---

### SetMovementStates (ID 102)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Definit les indicateurs d'etat de mouvement du joueur, utilise pour la correction de mouvement autoritaire du serveur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = movementStates present |
| 1 | movementStates | SavedMovementStates | 1 | Indicateurs de mouvement sauvegardes (optionnel) |

**Taille fixe :** 2 octets

---

### SetBlockPlacementOverride (ID 103)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Active ou desactive le mode de surcharge de placement de bloc, permettant le placement dans des zones normalement restreintes (fonctionnalite mode editeur/creatif).

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | enabled | octet | 1 | Booleen : surcharge activee |

**Taille fixe :** 1 octet

---

### LoadHotbar (ID 106)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Demande de charger une configuration de barre d'acces rapide sauvegardee depuis une ligne d'inventaire specifique.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | inventoryRow | octet | 1 | Index de la ligne d'inventaire source |

**Taille fixe :** 1 octet

---

### SaveHotbar (ID 107)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Demande de sauvegarder la barre d'acces rapide actuelle vers une ligne d'inventaire specifique.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | inventoryRow | octet | 1 | Index de la ligne d'inventaire cible |

**Taille fixe :** 1 octet

---

### UpdateMovementSettings (ID 110)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour les parametres de mouvement du joueur, y compris la vitesse, la hauteur de saut et les parametres physiques.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = movementSettings present |
| 1 | movementSettings | MovementSettings | 251 | Configuration complete du mouvement (optionnel) |

**Taille fixe :** 252 octets

---

### DamageInfo (ID 112)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Notifie le client des degats recus, y compris la position source et la cause pour les indicateurs directionnels et ecrans de mort.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = position presente, bit 1 = cause presente |
| 1 | damageSourcePosition | Vector3d | 24 | Position mondiale de la source de degats (optionnel) |
| 25 | damageAmount | float LE | 4 | Quantite de degats infliges |
| 29 | damageCause | DamageCause | Variable | Details de la cause des degats (optionnel) |

**Taille fixe :** 29 octets (minimum)
**Taille maximale :** 32 768 048 octets

---

### ReticleEvent (ID 113)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Declenche un evenement d'animation de reticule/viseur comme la confirmation de coup ou le retour d'action invalide.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | eventIndex | int32 LE | 4 | ID d'evenement de reticule du registre d'assets |

**Taille fixe :** 4 octets

---

### DisplayDebug (ID 114)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Affiche une forme de visualisation de debogage dans le monde. Utilise pour le developpement, le debogage de collision et le pathfinding.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Indicateurs de presence pour les champs optionnels |
| 1 | shape | octet | 1 | Enum DebugShape : Sphere, Box, Line, etc. |
| 2 | color | Vector3f | 12 | Couleur RVB (optionnel) |
| 14 | time | float LE | 4 | Duree d'affichage en secondes |
| 18 | fade | octet | 1 | Booleen : animation de fondu |
| 19 | matrixOffset | int32 LE | 4 | Offset vers la matrice de transformation |
| 23 | frustumProjectionOffset | int32 LE | 4 | Offset vers la projection frustum |
| 27+ | matrix | VarInt + float[] | Variable | Matrice de transformation 4x4 (optionnel) |
| - | frustumProjection | VarInt + float[] | Variable | Matrice de projection frustum (optionnel) |

**Taille fixe :** 27 octets (minimum)
**Taille maximale :** 32 768 037 octets

---

### ClearDebugShapes (ID 115)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Efface toutes les formes de visualisation de debogage du client.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| (aucun champ) | - | 0 | Paquet vide |

**Taille fixe :** 0 octet

---

### UpdateMemoriesFeatureStatus (ID 118)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour le statut de deblocage de la fonctionnalite memoires/journal pour le joueur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | isFeatureUnlocked | octet | 1 | Booleen : fonctionnalite memoires debloquee |

**Taille fixe :** 1 octet

---

## Paquets de Configuration Supplementaires

Cette section documente les paquets utilises pendant la phase de configuration et d'initialisation de la connexion.

### WorldLoadProgress (ID 21)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Rapporte la progression du chargement du monde au client pour l'affichage sur l'ecran de chargement.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = status present |
| 1 | percentComplete | int32 LE | 4 | Progression globale du chargement (0-100) |
| 5 | percentCompleteSubitem | int32 LE | 4 | Progression de la tache actuelle (0-100) |
| 9 | status | VarString | Variable | Message de statut a afficher (optionnel) |

**Taille fixe :** 9 octets (minimum)
**Taille maximale :** 16 384 014 octets

---

### WorldLoadFinished (ID 22)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Signale que le chargement du monde est termine et que le client peut fermer l'ecran de chargement.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| (aucun champ) | - | 0 | Paquet vide |

**Taille fixe :** 0 octet

---

### RemoveAssets (ID 27)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Ordonne au client de supprimer des assets specifiques de la memoire. Utilise pour la gestion de contenu dynamique.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = tableau asset present |
| 1 | asset | VarInt + Asset[] | Variable | Tableau d'assets a supprimer (optionnel) |

**Taille fixe :** 1 octet (minimum)
**Taille maximale :** 1 677 721 600 octets

---

### RequestCommonAssetsRebuild (ID 28)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Demande au serveur de reconstruire et renvoyer les donnees d'assets communs. Utilise quand le client detecte une corruption d'asset ou une incompatibilite de version.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| (aucun champ) | - | 0 | Paquet vide |

**Taille fixe :** 0 octet

---

### SetUpdateRate (ID 29)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Definit le taux de mise a jour attendu du client pour la synchronisation des entites et du monde.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | updatesPerSecond | int32 LE | 4 | Mises a jour cibles par seconde (tick rate) |

**Taille fixe :** 4 octets

---

### SetTimeDilation (ID 30)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Definit le facteur de dilatation temporelle pour les effets de ralenti ou d'acceleration.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | timeDilation | float LE | 4 | Multiplicateur d'echelle de temps (1.0 = normal, 0.5 = moitie de vitesse, 2.0 = double vitesse) |

**Taille fixe :** 4 octets

---

### UpdateFeatures (ID 31)

**Direction :** Serveur -> Client
**Compresse :** Non
**Description :** Met a jour le statut active/desactive des fonctionnalites de gameplay cote client.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = carte features presente |
| 1 | features | VarInt + Map | Variable | Dictionnaire d'indicateurs de fonctionnalite (optionnel) |

**Valeurs ClientFeature :**
- `0` - SplitVelocity : Mecaniques de velocite divisee
- `1` - Mantling : Capacite d'agripper les rebords
- `2` - SprintForce : Mecaniques de force de sprint
- `3` - CrouchSlide : Capacite de glissade accroupie
- `4` - SafetyRoll : Roulade de degats de chute
- `5` - DisplayHealthBars : Afficher les barres de vie des entites
- `6` - DisplayCombatText : Afficher les nombres de degats

**Taille fixe :** 1 octet (minimum)
**Taille maximale :** 8 192 006 octets

---

### PlayerOptions (ID 33)

**Direction :** Client -> Serveur
**Compresse :** Non
**Description :** Envoie les options de personnalisation du joueur, y compris les donnees de skin, au serveur.

| Offset | Champ | Type | Taille | Description |
|--------|-------|------|--------|-------------|
| 0 | nullBits | octet | 1 | Bit 0 = skin present |
| 1 | skin | PlayerSkin | Variable | Donnees de skin du joueur (optionnel) |

**Taille fixe :** 1 octet (minimum)
**Taille maximale :** 327 680 184 octets